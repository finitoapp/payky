import { afterEach, describe, expect, test, vi } from "vitest"

import { apiUrl, appEnv } from "./app-env.ts"

describe("appEnv", () => {
  test("leaves the EET production endpoint unset without configuration", () => {
    expect(appEnv.VITE_PAYKY_EET_PRODUCTION_URL).toBeUndefined()
  })
})

describe("apiUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("calls the API of the deployment the page was served from", () => {
    vi.stubGlobal("window", { location: { origin: "https://edge.payky.me" } })

    expect(apiUrl("/api/donations")).toBe("https://edge.payky.me/api/donations")
  })

  test("calls payky.me without a page to take the origin from", () => {
    expect(apiUrl("/api/donations")).toBe("https://payky.me/api/donations")
  })
})
