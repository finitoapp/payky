import type { HttpHeaders, HttpOptions } from "@capacitor/core"
import {
  AbortError,
  err,
  type OwnerId,
  ok,
  type Result,
  type Task,
  tryAsync,
} from "@evolu/common"
import { defineError } from "@/core/error.ts"
import type { MasterKey } from "@/core/modules/shared/key-derivation.ts"
import { getNativeRuntime } from "@/core/native/runtime.ts"

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

const createFetchJsonError = defineError("FetchJsonError")<{
  readonly message: string
  readonly error: unknown
}>()
export type FetchJsonError = ReturnType<typeof createFetchJsonError>

const parseJsonBody = (text: string): Result<unknown, FetchJsonError> => {
  try {
    return ok(JSON.parse(text) as unknown)
  } catch (error) {
    return err(
      createFetchJsonError({
        message: "Response body is not valid JSON.",
        error,
      })
    )
  }
}

/**
 * Fetches through {@link appFetchAsText} and additionally parses the body as
 * JSON.
 *
 * HTTP-level handling stays with the caller: `ok`, `status`, and the raw
 * `text` describe the HTTP response, while `json` carries the parsed body as
 * a Result. A non-JSON body is represented as a {@link FetchJsonError} on the
 * `json` Result so each client can turn it into its own typed parse error
 * (carrying `status` and `responseBody`) after it has handled HTTP-level
 * failures, matching the FIO client convention.
 */
export const appFetchAsJson =
  (
    url: string | URL,
    init?: RequestInit
  ): Task<
    Pick<Response, "ok" | "status"> & {
      readonly text: string
      readonly json: Result<unknown, FetchJsonError>
    },
    FetchError,
    FetchDep
  > =>
  async (run) => {
    const response = await run(appFetchAsText(url, init))
    if (!response.ok) return response

    return ok({
      ...response.value,
      json: parseJsonBody(response.value.text),
    })
  }

let capacitorHttpPromise:
  | Promise<{
      readonly CapacitorHttp: typeof import("@capacitor/core").CapacitorHttp
    }>
  | undefined

const getCapacitorHttp = async () => {
  capacitorHttpPromise ??= import("@capacitor/core").then(
    ({ CapacitorHttp }) => ({ CapacitorHttp })
  )

  return capacitorHttpPromise
}

const getRequestHeaders = (request: Request): HttpHeaders => {
  const headers: HttpHeaders = {}

  request.headers.forEach((value, key) => {
    headers[key] = value
  })

  return headers
}

const getRequestData = async (
  request: Request
): Promise<Pick<HttpOptions, "data">> => {
  if (request.method === "GET" || request.method === "HEAD") return {}

  const data = await request.clone().text()

  return data.length > 0 ? { data } : {}
}

const createResponseBody = (data: unknown): BodyInit | null => {
  if (data === null || data === undefined) return null
  if (typeof data === "string") return data
  if (data instanceof Blob) return data
  if (data instanceof ArrayBuffer) return data
  if (
    typeof data === "number" ||
    typeof data === "boolean" ||
    typeof data === "bigint"
  ) {
    return data.toString()
  }

  return JSON.stringify(data)
}

const throwIfAborted = (signal: AbortSignal): void => {
  if (!signal.aborted) return

  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError")
}

const capacitorFetch: typeof globalThis.fetch = async (input, init) => {
  const request = new Request(input, init)
  throwIfAborted(request.signal)

  const [capacitorHttp, requestData] = await Promise.all([
    getCapacitorHttp(),
    getRequestData(request),
  ])

  throwIfAborted(request.signal)

  const response = await capacitorHttp.CapacitorHttp.request({
    url: request.url,
    method: request.method,
    headers: getRequestHeaders(request),
    responseType: "text",
    ...requestData,
  })

  throwIfAborted(request.signal)

  return new Response(createResponseBody(response.data), {
    status: response.status,
    headers: response.headers,
  })
}

export const createFetchDep = (): FetchDep => ({
  fetch: async (...args) => {
    const runtime = getNativeRuntime()

    if (runtime === "capacitor") {
      return capacitorFetch(...args)
    }

    return globalThis.fetch(...args)
  },
})

export type EvoluOwnerIdDep = { readonly evoluOwnerId: OwnerId }

export type MasterKeyDep = { readonly masterKey: MasterKey }

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
