import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import type { FetchDep } from "@/core/deps.ts"
import {
  type DonationsHttpError,
  type DonationsResponseError,
  fetchDonationHistory,
} from "./donations-client.ts"

const inputToString = (input: RequestInfo | URL): string =>
  input instanceof URL ? input.toString() : String(input)

describe("donations client", () => {
  test("downloads and normalizes a donation history page", async () => {
    const requestedUrls: string[] = []
    const deps = {
      fetch: async (input) => {
        requestedUrls.push(inputToString(input))
        return Response.json({
          items: [{ amountSats: 21, occurredAt: 1_700_000_000_000 }],
          nextCursor: "abc",
        })
      },
    } satisfies FetchDep
    await using run = testCreateRun(deps)

    await expect(run(fetchDonationHistory({}))).resolves.toEqual({
      ok: true,
      value: {
        items: [{ amountSats: 21, occurredAt: 1_700_000_000_000 }],
        nextCursor: "abc",
      },
    })
    expect(requestedUrls).toEqual(["/api/donations"])
  })

  test("appends the cursor as a query parameter", async () => {
    const requestedUrls: string[] = []
    const deps = {
      fetch: async (input) => {
        requestedUrls.push(inputToString(input))
        return Response.json({ items: [], nextCursor: null })
      },
    } satisfies FetchDep
    await using run = testCreateRun(deps)

    await run(fetchDonationHistory({ cursor: "next page" }))

    expect(requestedUrls).toEqual(["/api/donations?cursor=next%20page"])
  })

  test("returns a null cursor as-is", async () => {
    const deps = {
      fetch: async () => Response.json({ items: [], nextCursor: null }),
    } satisfies FetchDep
    await using run = testCreateRun(deps)

    await expect(run(fetchDonationHistory({}))).resolves.toEqual({
      ok: true,
      value: { items: [], nextCursor: null },
    })
  })

  test("returns a typed HTTP error", async () => {
    const deps = {
      fetch: async () => new Response("Service unavailable", { status: 503 }),
    } satisfies FetchDep
    await using run = testCreateRun(deps)

    await expect(run(fetchDonationHistory({}))).resolves.toMatchObject({
      ok: false,
      error: {
        type: "DonationsHttpError",
        message: "Donation history request failed: 503",
        status: 503,
        responseBody: "Service unavailable",
      } satisfies Partial<DonationsHttpError>,
    })
  })

  test("returns a typed error for a malformed response", async () => {
    const deps = {
      fetch: async () => Response.json({ items: "not-an-array" }),
    } satisfies FetchDep
    await using run = testCreateRun(deps)

    await expect(run(fetchDonationHistory({}))).resolves.toMatchObject({
      ok: false,
      error: {
        type: "DonationsResponseError",
        message: "Invalid donation history response.",
        status: 200,
      } satisfies Partial<DonationsResponseError>,
    })
  })

  test("returns a typed error for a non-JSON response", async () => {
    const deps = {
      fetch: async () => new Response("not json", { status: 200 }),
    } satisfies FetchDep
    await using run = testCreateRun(deps)

    await expect(run(fetchDonationHistory({}))).resolves.toMatchObject({
      ok: false,
      error: {
        type: "DonationsResponseError",
        message: "Invalid donation history response.",
        status: 200,
        responseBody: "not json",
      } satisfies Partial<DonationsResponseError>,
    })
  })
})
