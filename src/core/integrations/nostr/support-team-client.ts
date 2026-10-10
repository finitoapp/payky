import type { Task } from "@evolu/common"
import { z } from "zod"

import { apiUrl } from "@/core/app-env.ts"
import {
  type FetchDep,
  type FetchError,
  fetchAndValidateJson,
} from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import type { SupportTeam } from "@/core/integrations/nostr/nostr-support-chat.ts"
import { npubToHex } from "@/core/integrations/nostr/npub.ts"

/** An npub as the hex pubkey the chat compares and tags. */
const NpubSchema = z.string().transform((value, context) => {
  const hex = npubToHex(value)
  if (hex !== null) return hex
  context.addIssue({ code: "custom", message: `Not an npub: ${value}` })
  return z.NEVER
})

const SupportTeamResponseSchema = z.object({
  pubkeys: z.array(NpubSchema).min(1),
  formerTeams: z.array(z.array(NpubSchema).min(1)),
  relays: z.array(z.url({ protocol: /^wss?$/u })).min(1),
  indexerRelays: z.array(z.url({ protocol: /^wss?$/u })),
})

const createSupportTeamHttpError = defineError("SupportTeamHttpError")<{
  readonly message: string
  readonly status: number
  readonly responseBody: string
}>()
export type SupportTeamHttpError = ReturnType<typeof createSupportTeamHttpError>

const createSupportTeamResponseError = defineError("SupportTeamResponseError")<{
  readonly message: string
  readonly status: number
  readonly responseBody: string
  readonly cause?: unknown
}>()
export type SupportTeamResponseError = ReturnType<
  typeof createSupportTeamResponseError
>

export type SupportTeamError =
  | SupportTeamHttpError
  | SupportTeamResponseError
  | FetchError

/**
 * The support team as Payky's API serves it, so it changes with a deploy.
 * There is no built-in fallback: without an answer the chat has nobody to
 * write to and says so (support/0001).
 */
export const fetchSupportTeam =
  (): Task<SupportTeam, SupportTeamError, FetchDep> => (run) =>
    run(
      fetchAndValidateJson({
        url: apiUrl("/api/support-team"),
        schema: SupportTeamResponseSchema,
        onHttpError: ({ status, responseBody }) =>
          createSupportTeamHttpError({
            message: `Support team request failed: ${status}`,
            status,
            responseBody,
          }),
        onResponseError: ({ status, responseBody, cause }) =>
          createSupportTeamResponseError({
            message: "Invalid support team response.",
            status,
            responseBody,
            cause,
          }),
      })
    )
