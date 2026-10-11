import type { HttpOptions, HttpResponse } from "@capacitor/core"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { createFetchDep } from "@/core/deps.ts"

const request = vi.fn<(options: HttpOptions) => Promise<HttpResponse>>()

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  CapacitorHttp: { request: (options: HttpOptions) => request(options) },
}))

const okResponse = (data: unknown): HttpResponse => ({
  data,
  status: 200,
  headers: { "content-type": "application/json" },
  url: "https://example.test/",
})

describe("createFetchDep on a native platform", () => {
  beforeEach(() => {
    request.mockReset()
  })

  test("sends no body for GET and passes timeouts as a backstop", async () => {
    request.mockResolvedValue(okResponse('{"ok":true}'))

    const response = await createFetchDep().fetch("https://example.test/", {
      headers: { "x-token": "abc" },
    })

    expect(await response.json()).toEqual({ ok: true })
    const options = request.mock.calls[0]?.[0]
    expect(options).toMatchObject({
      method: "GET",
      headers: { "x-token": "abc" },
      connectTimeout: 30_000,
      readTimeout: 30_000,
    })
    expect(options).not.toHaveProperty("data")
  })

  test("forwards a POST body and stringifies a parsed response", async () => {
    request.mockResolvedValue(okResponse({ parsed: 1 }))

    const response = await createFetchDep().fetch("https://example.test/", {
      method: "POST",
      body: "<xml/>",
    })

    expect(request.mock.calls[0]?.[0]).toMatchObject({ data: "<xml/>" })
    expect(await response.text()).toBe('{"parsed":1}')
  })

  test("rejects a pre-aborted signal without sending", async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      createFetchDep().fetch("https://example.test/", {
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(request).not.toHaveBeenCalled()
  })

  test("rejects as soon as the signal aborts mid-request", async () => {
    // The native request never answers, as on a stalled connection.
    request.mockReturnValue(new Promise(() => {}))
    const controller = new AbortController()

    const pending = createFetchDep().fetch("https://example.test/", {
      signal: controller.signal,
    })
    await vi.waitFor(() => {
      expect(request).toHaveBeenCalled()
    })
    controller.abort(new DOMException("Timed out", "TimeoutError"))

    await expect(pending).rejects.toMatchObject({ name: "TimeoutError" })
  })
})
