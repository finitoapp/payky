import { AbortError, type OwnerId, type Task, tryAsync } from "@evolu/common"
import { isTauri } from "@tauri-apps/api/core"
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

let tauriHttpFetchPromise:
  | Promise<typeof import("@tauri-apps/plugin-http").fetch>
  | undefined

const getTauriHttpFetch = async () => {
  tauriHttpFetchPromise ??= import("@tauri-apps/plugin-http").then(
    ({ fetch }) => fetch
  )

  return tauriHttpFetchPromise
}

export const createFetchDep = (): FetchDep => ({
  fetch: async (...args) => {
    if (!isTauri()) {
      return globalThis.fetch(...args)
    }

    const tauriFetch = await getTauriHttpFetch()
    return tauriFetch(...args)
  },
})

export type EvoluOwnerIdDep = { readonly evoluOwnerId: OwnerId }

export type DateDep = {
  readonly date: {
    readonly now: () => Date
  }
}

export const createDateDep = () => ({
  date: {
    now: () => new Date(),
  },
})
