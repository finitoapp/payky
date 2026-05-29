import { AbortError, type Task, tryAsync } from "@evolu/common"
import { defineError } from "@/core/error.ts"

export interface FetchDep {
  readonly fetch: typeof globalThis.fetch
}

const createFetchError = defineError("FetchError")<{
  readonly error: unknown
}>()
export type FetchError = ReturnType<typeof createFetchError>

export const appFetch =
  (
    url: string | URL,
    init?: RequestInit
  ): Task<Response, FetchError, FetchDep> =>
  ({ deps, signal }) =>
    tryAsync(
      () => deps.fetch(url, { ...init, signal }),
      (error): FetchError | AbortError => {
        if (AbortError.is(error)) return error
        return createFetchError({ error })
      }
    )

export const createFetchDep = () => ({
  fetch: globalThis.fetch.bind(globalThis),
})
