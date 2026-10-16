import type { WalletTransfer } from "@buildonspark/spark-sdk/types"
import type {
  DonationHistoryItem,
  DonationHistoryPage,
} from "@payky/core/integrations/donations/donation-history"
import { jsonCodec } from "@payky/core/zod-utils"
import { z } from "zod"
import {
  createDonateWallet,
  type DonateWallet,
  loadDonateWalletConfig,
} from "../src/server/donate-wallet.js"
import { jsonApi } from "./_http.js"

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const MAX_PAGES_PER_REQUEST = 20
const COMPLETED_TRANSFER_STATUS = "TRANSFER_STATUS_COMPLETED"
const INCOMING_TRANSFER_DIRECTION = "INCOMING"

interface DonationsError {
  readonly status: "ERROR"
  readonly reason: string
}

export interface DonateTransfer {
  readonly status: WalletTransfer["status"]
  readonly totalValue: number
  readonly transferDirection: WalletTransfer["transferDirection"]
  readonly createdTime: Date | undefined
  readonly updatedTime: Date | undefined
}

interface DonateTransferPage {
  readonly transfers: readonly DonateTransfer[]
  readonly offset: number
}

export interface DonateTransferSource {
  readonly getTransfers: (
    limit: number,
    offset: number
  ) => Promise<DonateTransferPage>
}

// Every request boots a mainnet wallet, so the CDN answers repeats of a
// page for a minute. Errors stay `no-store` so a failed load is not pinned.
// ponytail: a varied query string still misses the cache; a per-IP rate
// limit (Vercel Firewall) is the upgrade if the endpoint gets hammered.
const SUCCESS_CACHE_CONTROL = "public, s-maxage=60"

const { jsonResponse, preflightResponse } = jsonApi<
  DonationHistoryPage | DonationsError
>({
  cacheControl: "no-store",
  methods: "GET",
})

const CursorJson = jsonCodec(
  z.object({
    offset: z.number().int().nonnegative(),
  })
)

export const encodeCursor = (offset: number): string =>
  Buffer.from(z.encode(CursorJson, { offset })).toString("base64url")

export const decodeCursor = (cursor: string): number | null => {
  const parsed = z.safeDecode(
    CursorJson,
    Buffer.from(cursor, "base64url").toString("utf8")
  )

  return parsed.success ? parsed.data.offset : null
}

export const parseLimit = (value: string | null): number => {
  if (value === null) return DEFAULT_LIMIT

  const limit = Number(value)
  if (!Number.isInteger(limit) || limit <= 0) return DEFAULT_LIMIT

  return Math.min(limit, MAX_LIMIT)
}

export const isDonation = (transfer: DonateTransfer): boolean =>
  transfer.status === COMPLETED_TRANSFER_STATUS &&
  transfer.totalValue > 0 &&
  transfer.transferDirection === INCOMING_TRANSFER_DIRECTION

export const toDonationItem = (
  transfer: DonateTransfer
): DonationHistoryItem => ({
  amountSats: transfer.totalValue,
  occurredAt: (
    transfer.updatedTime ??
    transfer.createdTime ??
    new Date()
  ).getTime(),
})

/**
 * Spark's `getTransfers` returns a fixed-size page of all transfer types, so
 * filtering down to incoming donations can leave a page short. Keep pulling
 * pages until either `limit` donations are collected or the source is
 * exhausted, capped by `MAX_PAGES_PER_REQUEST` to bound worst-case latency
 * when donations are sparse among many other transfers.
 *
 * The cursor is a transfer offset, not a donation offset, so collection stops
 * *inside* the page that reaches `limit` and resumes at the transfer right
 * after the last one collected. Draining the whole page and truncating the
 * surplus instead would advance the cursor past donations that were never
 * returned, making them unreachable for good.
 */
export const collectDonationsPage = async (
  source: DonateTransferSource,
  { limit, offset }: { readonly limit: number; readonly offset: number }
): Promise<DonationHistoryPage> => {
  const items: DonationHistoryItem[] = []
  let currentOffset = offset

  for (let page = 0; page < MAX_PAGES_PER_REQUEST; page += 1) {
    const result = await source.getTransfers(limit, currentOffset)

    for (const [index, transfer] of result.transfers.entries()) {
      if (!isDonation(transfer)) continue

      items.push(toDonationItem(transfer))
      if (items.length >= limit) {
        return { items, nextCursor: encodeCursor(currentOffset + index + 1) }
      }
    }

    if (result.transfers.length === 0 || result.offset <= currentOffset) {
      return { items, nextCursor: null }
    }

    currentOffset = result.offset
  }

  return { items, nextCursor: encodeCursor(currentOffset) }
}

const createDefaultTransferSource = (
  wallet: DonateWallet
): DonateTransferSource => ({
  getTransfers: (limit, offset) => wallet.getTransfers(limit, offset),
})

const handleRequest = async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") return preflightResponse()

  if (request.method !== "GET") {
    return jsonResponse(
      { status: "ERROR", reason: "Method not allowed." },
      { status: 405 }
    )
  }

  const config = loadDonateWalletConfig()
  if (config === null) {
    return jsonResponse(
      { status: "ERROR", reason: "Donation endpoint is not configured." },
      { status: 500 }
    )
  }

  const requestUrl = new URL(request.url)
  const limit = parseLimit(requestUrl.searchParams.get("limit"))
  const cursorParam = requestUrl.searchParams.get("cursor")
  const offset = cursorParam === null ? 0 : decodeCursor(cursorParam)

  if (offset === null) {
    return jsonResponse(
      { status: "ERROR", reason: "Invalid cursor." },
      { status: 400 }
    )
  }

  let wallet: DonateWallet | undefined

  try {
    wallet = await createDonateWallet(config)

    return jsonResponse(
      await collectDonationsPage(createDefaultTransferSource(wallet), {
        limit,
        offset,
      }),
      { headers: { "cache-control": SUCCESS_CACHE_CONTROL } }
    )
  } catch {
    return jsonResponse(
      { status: "ERROR", reason: "Could not load donation history." },
      { status: 502 }
    )
  } finally {
    await wallet?.cleanup()
  }
}

export const GET = handleRequest
export const OPTIONS = handleRequest

export default {
  fetch: handleRequest,
}
