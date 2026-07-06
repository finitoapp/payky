import { z } from "zod"
import {
  createDonateWallet,
  type DonateWallet,
  loadDonateWalletConfig,
} from "./donate-wallet.ts"

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const MAX_PAGES_PER_REQUEST = 20
const COMPLETED_TRANSFER_STATUS = "TRANSFER_STATUS_COMPLETED"
const INCOMING_TRANSFER_DIRECTION = "INCOMING"

export interface DonationItem {
  readonly amountSats: number
  readonly occurredAt: number
}

export interface DonationsResponse {
  readonly items: readonly DonationItem[]
  readonly nextCursor: string | null
}

interface DonationsError {
  readonly status: "ERROR"
  readonly reason: string
}

export interface DonateTransfer {
  readonly status: string
  readonly totalValue: number
  readonly transferDirection: string
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

const jsonHeaders = {
  "access-control-allow-origin": "*",
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
} as const

const jsonResponse = (
  body: DonationsResponse | DonationsError,
  init?: ResponseInit
): Response =>
  Response.json(body, {
    ...init,
    headers: {
      ...jsonHeaders,
      ...init?.headers,
    },
  })

const CursorSchema = z.object({
  offset: z.number().int().nonnegative(),
})

export const encodeCursor = (offset: number): string =>
  Buffer.from(JSON.stringify({ offset })).toString("base64url")

export const decodeCursor = (cursor: string): number | null => {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    ) as unknown
    const parsed = CursorSchema.safeParse(decoded)

    return parsed.success ? parsed.data.offset : null
  } catch {
    return null
  }
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

export const toDonationItem = (transfer: DonateTransfer): DonationItem => ({
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
 */
export const collectDonationsPage = async (
  source: DonateTransferSource,
  { limit, offset }: { readonly limit: number; readonly offset: number }
): Promise<DonationsResponse> => {
  const items: DonationItem[] = []
  let currentOffset = offset
  let exhausted = false

  for (let page = 0; page < MAX_PAGES_PER_REQUEST; page += 1) {
    const result = await source.getTransfers(limit, currentOffset)

    for (const transfer of result.transfers) {
      if (isDonation(transfer)) items.push(toDonationItem(transfer))
    }

    if (result.transfers.length === 0 || result.offset <= currentOffset) {
      exhausted = true
      break
    }

    currentOffset = result.offset
    if (items.length >= limit) break
  }

  return {
    items: items.slice(0, limit),
    nextCursor: exhausted ? null : encodeCursor(currentOffset),
  }
}

const createDefaultTransferSource = (
  wallet: DonateWallet
): DonateTransferSource => ({
  getTransfers: (limit, offset) => wallet.getTransfers(limit, offset),
})

const handleRequest = async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        ...jsonHeaders,
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "content-type",
      },
    })
  }

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
      })
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
