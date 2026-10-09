import { describe, expect, test } from "vitest"

import { jsonApi } from "./_http.ts"

describe("jsonApi", () => {
  const { jsonResponse, preflightResponse } = jsonApi<{ readonly ok: true }>({
    cacheControl: "public, max-age=60",
    methods: "POST",
  })

  test("answers JSON with CORS and the handler's cache policy", async () => {
    const response = jsonResponse({ ok: true })

    expect(await response.json()).toEqual({ ok: true })
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=60",
      "content-type": "application/json; charset=utf-8",
    })
  })

  test("lets one response override a header, as an error that must not be cached does", () => {
    const response = jsonResponse(
      { ok: true },
      { status: 502, headers: { "cache-control": "no-store" } }
    )

    expect(response.status).toBe(502)
    expect(response.headers.get("cache-control")).toBe("no-store")
  })

  test("allows the handler's methods plus OPTIONS in the preflight", () => {
    const response = preflightResponse()

    expect(response.status).toBe(200)
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "POST, OPTIONS"
    )
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "content-type"
    )
  })
})
