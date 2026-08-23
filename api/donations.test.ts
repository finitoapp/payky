import { afterEach, describe, expect, test, vi } from "vitest"
import type {
  DonateWallet,
  DonateWalletConfig,
} from "../src/core/server/donate-wallet.js"
import {
  collectDonationsPage,
  type DonateTransfer,
  type DonateTransferSource,
  decodeCursor,
  encodeCursor,
  GET,
  isDonation,
  OPTIONS,
  parseLimit,
  toDonationItem,
} from "./donations.ts"

vi.mock("../src/core/server/donate-wallet.js", () => ({
  loadDonateWalletConfig: vi.fn(),
  createDonateWallet: vi.fn(),
}))

const { loadDonateWalletConfig, createDonateWallet } = await import(
  "../src/core/server/donate-wallet.js"
)

const config: DonateWalletConfig = { mnemonic: "test mnemonic" }

afterEach(() => {
  vi.mocked(loadDonateWalletConfig).mockReset()
  vi.mocked(createDonateWallet).mockReset()
})

const donation = (overrides: Partial<DonateTransfer> = {}): DonateTransfer => ({
  status: "TRANSFER_STATUS_COMPLETED",
  totalValue: 1_000,
  transferDirection: "INCOMING",
  createdTime: new Date("2026-01-01T00:00:00Z"),
  updatedTime: new Date("2026-01-01T00:00:05Z"),
  ...overrides,
})

const createSource = (
  pages: readonly (readonly DonateTransfer[])[]
): DonateTransferSource & { readonly calls: number[] } => {
  const calls: number[] = []

  return {
    calls,
    getTransfers: (limit, offset) => {
      calls.push(offset)
      const pageIndex = offset / limit
      const transfers = pages[pageIndex] ?? []

      return Promise.resolve({
        transfers,
        offset: transfers.length === 0 ? offset : offset + limit,
      })
    },
  }
}

describe("isDonation", () => {
  test("accepts a completed incoming transfer with a positive value", () => {
    expect(isDonation(donation())).toBe(true)
  })

  test("rejects an outgoing transfer", () => {
    expect(isDonation(donation({ transferDirection: "OUTGOING" }))).toBe(false)
  })

  test("rejects a non-completed transfer", () => {
    expect(
      isDonation(donation({ status: "TRANSFER_STATUS_SENDER_INITIATED" }))
    ).toBe(false)
  })

  test("rejects a zero-value transfer", () => {
    expect(isDonation(donation({ totalValue: 0 }))).toBe(false)
  })
})

describe("toDonationItem", () => {
  test("prefers updatedTime over createdTime", () => {
    expect(toDonationItem(donation()).occurredAt).toBe(
      new Date("2026-01-01T00:00:05Z").getTime()
    )
  })

  test("falls back to createdTime when updatedTime is missing", () => {
    expect(
      toDonationItem(donation({ updatedTime: undefined })).occurredAt
    ).toBe(new Date("2026-01-01T00:00:00Z").getTime())
  })
})

describe("cursor encoding", () => {
  test("round-trips an offset", () => {
    expect(decodeCursor(encodeCursor(42))).toBe(42)
  })

  test("rejects a malformed cursor", () => {
    expect(decodeCursor("not-a-cursor")).toBeNull()
  })

  test("rejects a cursor with a negative offset", () => {
    expect(decodeCursor(encodeCursor(-1))).toBeNull()
  })
})

describe("parseLimit", () => {
  test("defaults when missing", () => {
    expect(parseLimit(null)).toBe(20)
  })

  test("defaults on a non-positive value", () => {
    expect(parseLimit("0")).toBe(20)
    expect(parseLimit("-5")).toBe(20)
  })

  test("defaults on a non-integer value", () => {
    expect(parseLimit("1.5")).toBe(20)
  })

  test("clamps to the maximum", () => {
    expect(parseLimit("1000")).toBe(50)
  })

  test("passes through a valid value", () => {
    expect(parseLimit("10")).toBe(10)
  })
})

describe("collectDonationsPage", () => {
  test("filters non-donation transfers out of a page", async () => {
    const source = createSource([
      [
        donation({ totalValue: 100 }),
        donation({ transferDirection: "OUTGOING" }),
        donation({ status: "TRANSFER_STATUS_SENDER_INITIATED" }),
      ],
    ])

    const result = await collectDonationsPage(source, { limit: 20, offset: 0 })

    expect(result.items).toEqual([
      { amountSats: 100, occurredAt: expect.any(Number) },
    ])
  })

  test("pulls additional pages until the limit is reached", async () => {
    const source = createSource([
      [donation({ transferDirection: "OUTGOING" })],
      [donation({ totalValue: 1 }), donation({ totalValue: 2 })],
    ])

    const result = await collectDonationsPage(source, { limit: 1, offset: 0 })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.amountSats).toBe(1)
    expect(source.calls).toEqual([0, 1])
    expect(decodeCursor(result.nextCursor ?? "")).toBe(2)
  })

  test("returns a null cursor once the source is exhausted", async () => {
    const source = createSource([[donation()]])

    const result = await collectDonationsPage(source, { limit: 20, offset: 0 })

    expect(result.nextCursor).toBeNull()
  })

  test("returns a null cursor when there are no transfers at all", async () => {
    const source = createSource([])

    const result = await collectDonationsPage(source, { limit: 20, offset: 0 })

    expect(result.items).toEqual([])
    expect(result.nextCursor).toBeNull()
  })
})

describe("GET/OPTIONS request handling", () => {
  test("answers an OPTIONS preflight without touching the wallet", async () => {
    const response = await OPTIONS(
      new Request("https://example.test/api/donations", { method: "OPTIONS" })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET, OPTIONS"
    )
    expect(loadDonateWalletConfig).not.toHaveBeenCalled()
  })

  test("rejects a non-GET request", async () => {
    const response = await GET(
      new Request("https://example.test/api/donations", { method: "POST" })
    )

    expect(response.status).toBe(405)
    expect(await response.json()).toEqual({
      status: "ERROR",
      reason: "Method not allowed.",
    })
  })

  test("returns 500 when the donation endpoint is not configured", async () => {
    vi.mocked(loadDonateWalletConfig).mockReturnValue(null)

    const response = await GET(
      new Request("https://example.test/api/donations")
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      status: "ERROR",
      reason: "Donation endpoint is not configured.",
    })
  })

  test("returns 400 for an invalid cursor", async () => {
    vi.mocked(loadDonateWalletConfig).mockReturnValue(config)

    const response = await GET(
      new Request(
        "https://example.test/api/donations?cursor=not-a-valid-cursor"
      )
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      status: "ERROR",
      reason: "Invalid cursor.",
    })
  })

  test("returns donations and cleans up the wallet on success", async () => {
    vi.mocked(loadDonateWalletConfig).mockReturnValue(config)
    const cleanup = vi.fn().mockResolvedValue(undefined)
    const wallet = {
      getTransfers: () =>
        Promise.resolve({
          transfers: [donation({ totalValue: 42 })],
          offset: 0,
        }),
      cleanup,
    } as unknown as DonateWallet
    vi.mocked(createDonateWallet).mockResolvedValue(wallet)

    const response = await GET(
      new Request("https://example.test/api/donations")
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      items: [{ amountSats: 42 }],
    })
    expect(cleanup).toHaveBeenCalledOnce()
  })

  test("returns 502 and still cleans up when the wallet fails", async () => {
    vi.mocked(loadDonateWalletConfig).mockReturnValue(config)
    const cleanup = vi.fn().mockResolvedValue(undefined)
    const wallet = {
      getTransfers: () => Promise.reject(new Error("upstream failure")),
      cleanup,
    } as unknown as DonateWallet
    vi.mocked(createDonateWallet).mockResolvedValue(wallet)

    const response = await GET(
      new Request("https://example.test/api/donations")
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      status: "ERROR",
      reason: "Could not load donation history.",
    })
    expect(cleanup).toHaveBeenCalledOnce()
  })

  test("returns 502 without a cleanup call when wallet creation itself fails", async () => {
    vi.mocked(loadDonateWalletConfig).mockReturnValue(config)
    vi.mocked(createDonateWallet).mockRejectedValue(
      new Error("could not initialize")
    )

    const response = await GET(
      new Request("https://example.test/api/donations")
    )

    expect(response.status).toBe(502)
  })
})
