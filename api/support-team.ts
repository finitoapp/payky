import { createEnv } from "@t3-oss/env-core"
import { decode } from "nostr-tools/nip19"
import { z } from "zod"

/**
 * The support chat's team (support/0001), served so it can change with a
 * deploy instead of an app release.
 */
export interface SupportTeamResponse {
  /** Who every message goes to. */
  readonly pubkeys: ReadonlyArray<string>
  /**
   * Every earlier line-up, so the app still recognises their rooms: NIP-17
   * names a room by its exact members, so a changed team is a new room.
   */
  readonly formerTeams: ReadonlyArray<ReadonlyArray<string>>
  /** Where every copy goes and the chat reads; each member lists one. */
  readonly relays: ReadonlyArray<string>
  /**
   * Profile indexers, only ever read: they hold the team's names and
   * pictures and the account's DM relay list when these live elsewhere.
   */
  readonly indexerRelays: ReadonlyArray<string>
}

interface SupportTeamError {
  readonly status: "ERROR"
  readonly reason: string
}

const isNpub = (value: string): boolean => {
  try {
    return decode(value).type === "npub"
  } catch {
    return false
  }
}

const RelayListSchema = z
  .string()
  .transform((value) => value.split(",").map((url) => url.trim()))
  .pipe(z.array(z.url({ protocol: /^wss?$/u })).min(1))

const NpubListSchema = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((npub) => npub.trim())
      .filter((npub) => npub !== "")
  )
  .pipe(z.array(z.string().refine(isNpub, "Not an npub.")).min(1))

const env = createEnv({
  server: {
    PAYKY_SUPPORT_NPUBS: NpubListSchema.default([
      "npub1ysdhhw8wx4ew4490mrfpd2gyv3w08rqudqp5pjasgn2kxduahuhstrqnll",
    ]),
    // Teams separated by ";", members by ",", oldest first. When the team
    // changes, its line-up until then is appended here.
    PAYKY_SUPPORT_FORMER_TEAMS: z
      .string()
      .transform((value) =>
        value
          .split(";")
          .map((team) => team.trim())
          .filter((team) => team !== "")
      )
      .pipe(z.array(NpubListSchema))
      .default([]),
    PAYKY_SUPPORT_RELAYS: RelayListSchema.default([
      "wss://relay.damus.io",
      "wss://nos.lol",
      "wss://relay.0xchat.com",
      "wss://nostr.linky.fit",
    ]),
    PAYKY_SUPPORT_INDEXER_RELAYS: RelayListSchema.default([
      "wss://purplepag.es",
      "wss://profiles.nostr1.com",
    ]),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})

const currentTeam: SupportTeamResponse = {
  pubkeys: env.PAYKY_SUPPORT_NPUBS,
  formerTeams: env.PAYKY_SUPPORT_FORMER_TEAMS,
  relays: env.PAYKY_SUPPORT_RELAYS,
  indexerRelays: env.PAYKY_SUPPORT_INDEXER_RELAYS,
}

const jsonHeaders = {
  "access-control-allow-origin": "*",
  // A deploy reaches every app within five minutes.
  "cache-control": "public, max-age=300",
  "content-type": "application/json; charset=utf-8",
} as const

const jsonResponse = (
  body: SupportTeamResponse | SupportTeamError,
  init?: ResponseInit
): Response =>
  Response.json(body, {
    ...init,
    headers: { ...jsonHeaders, ...init?.headers },
  })

export const handleSupportTeamRequest = (
  request: Request,
  team: SupportTeamResponse = currentTeam
): Response => {
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

  return jsonResponse(team)
}

const handleRequest = (request: Request): Response =>
  handleSupportTeamRequest(request)

export const GET = handleRequest
export const OPTIONS = handleRequest

export default {
  fetch: handleRequest,
}
