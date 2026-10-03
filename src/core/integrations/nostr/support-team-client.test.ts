import { testCreateRun } from "@evolu/common"
import { npubEncode } from "nostr-tools/nip19"
import { describe, expect, test } from "vitest"

import type { FetchDep } from "@/core/deps.ts"

import { fetchSupportTeam } from "./support-team-client.ts"

const current = "a".repeat(64)
const former = "b".repeat(64)

const serving = (body: unknown, status = 200) => {
  const requestedUrls: string[] = []
  const deps = {
    fetch: async (input) => {
      requestedUrls.push(String(input))
      return Response.json(body, { status })
    },
  } satisfies FetchDep
  return { deps, requestedUrls }
}

describe("support team client", () => {
  test("reads the team from Payky's API with its npubs as hex pubkeys", async () => {
    const server = serving({
      pubkeys: [npubEncode(current)],
      formerTeams: [[npubEncode(former)]],
      relays: ["wss://support.test"],
    })
    await using run = testCreateRun(server.deps)

    expect(await run(fetchSupportTeam())).toEqual({
      ok: true,
      value: {
        pubkeys: [current],
        formerTeams: [[former]],
        relays: ["wss://support.test"],
      },
    })
    expect(server.requestedUrls).toEqual(["https://payky.me/api/support-team"])
  })

  test("rejects a team with something other than an npub", async () => {
    await using run = testCreateRun(
      serving({
        pubkeys: [current],
        formerTeams: [],
        relays: ["wss://support.test"],
      }).deps
    )

    expect(await run(fetchSupportTeam())).toMatchObject({
      ok: false,
      error: { type: "SupportTeamResponseError" },
    })
  })

  test("reports a failed request", async () => {
    await using run = testCreateRun(
      serving({ status: "ERROR", reason: "down" }, 503).deps
    )

    expect(await run(fetchSupportTeam())).toMatchObject({
      ok: false,
      error: { type: "SupportTeamHttpError", status: 503 },
    })
  })
})
