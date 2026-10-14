import { ok, type Task } from "@evolu/common"
import { z } from "zod"

import { appEnv } from "@/core/app-env.ts"
import {
  type FetchDep,
  type FetchError,
  fetchAndValidateJson,
} from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"

/** The body of linky.fit/recommended-relays (Linky's `RecommendedRelayLists`). */
const LinkyRecommendedRelaysSchema = z.object({
  nostr: z.array(z.string()),
  evolu: z.array(z.url({ protocol: /^wss$/u })).min(1),
})

const createLinkyRelaysHttpError = defineError("LinkyRelaysHttpError")<{
  readonly status: number
  readonly responseBody: string
}>()
export type LinkyRelaysHttpError = ReturnType<typeof createLinkyRelaysHttpError>

const createLinkyRelaysResponseError = defineError("LinkyRelaysResponseError")<{
  readonly status: number
  readonly responseBody: string
  readonly cause: unknown
}>()
export type LinkyRelaysResponseError = ReturnType<
  typeof createLinkyRelaysResponseError
>

/** The Evolu relays Linky recommends, the ones its Cashu wallet syncs through. */
export const fetchLinkyEvoluRelays: Task<
  ReadonlyArray<string>,
  LinkyRelaysHttpError | LinkyRelaysResponseError | FetchError,
  FetchDep
> = async (run) => {
  const result = await run(
    fetchAndValidateJson({
      url: appEnv.VITE_LINKY_RELAYS_URL,
      schema: LinkyRecommendedRelaysSchema,
      onHttpError: createLinkyRelaysHttpError,
      onResponseError: createLinkyRelaysResponseError,
    })
  )
  if (!result.ok) return result
  return ok(result.value.evolu)
}
