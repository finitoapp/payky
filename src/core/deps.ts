import { AbortError, type OwnerId, type Task, tryAsync } from "@evolu/common"
import { defineError } from "@/core/error.ts"

export interface FetchDep {
  readonly fetch: typeof globalThis.fetch
}

const createFetchError = defineError("FetchError")<{
  readonly error: unknown
}>()
export type FetchError = ReturnType<typeof createFetchError>

export const appFetchAsText =
  (
    url: string | URL,
    init?: RequestInit
  ): Task<
    Pick<Response, "ok" | "status"> & { text: string },
    FetchError,
    FetchDep
  > =>
  ({ deps, signal }) =>
    tryAsync(
      async () => {
        const response = await deps.fetch(url, { ...init, signal })

        return {
          text: await response.text(),
          ok: response.ok,
          status: response.status,
        }
      },
      (error): FetchError | AbortError => {
        if (AbortError.is(error)) return error
        return createFetchError({ error })
      }
    )

export const createFetchDep = () => ({
  fetch: globalThis.fetch.bind(globalThis),
})

export type EvoluOwnerIdDep = { readonly evoluOwnerId: OwnerId }
