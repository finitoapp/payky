import { describe, expect, test } from "vitest"

import {
  handleSupportTeamRequest,
  type SupportTeamResponse,
} from "./support-team.ts"

const team: SupportTeamResponse = {
  pubkeys: ["npub1current"],
  formerTeams: [["npub1former"]],
  relays: ["wss://support.test"],
  indexerRelays: ["wss://indexer.test"],
}

const request = (method: string) =>
  new Request("https://payky.me/api/support-team", { method })

describe("handleSupportTeamRequest", () => {
  test("serves the team with its former line-ups and relays, cached for five minutes", async () => {
    const response = handleSupportTeamRequest(request("GET"), team)

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("public, max-age=300")
    expect(await response.json()).toEqual(team)
  })

  test("serves the build's default team when nothing is configured", async () => {
    const response = handleSupportTeamRequest(request("GET"))

    expect(await response.json()).toEqual({
      pubkeys: [
        "npub1ysdhhw8wx4ew4490mrfpd2gyv3w08rqudqp5pjasgn2kxduahuhstrqnll",
      ],
      formerTeams: [],
      relays: [
        "wss://relay.damus.io",
        "wss://nos.lol",
        "wss://relay.0xchat.com",
        "wss://nostr.linky.fit",
      ],
      indexerRelays: ["wss://purplepag.es", "wss://profiles.nostr1.com"],
    })
  })

  test("answers a CORS preflight and refuses other methods", () => {
    expect(handleSupportTeamRequest(request("OPTIONS"), team).status).toBe(200)
    expect(handleSupportTeamRequest(request("POST"), team).status).toBe(405)
  })
})
