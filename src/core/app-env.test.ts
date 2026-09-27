import { describe, expect, test } from "vitest"

import { appEnv } from "./app-env.ts"

describe("appEnv", () => {
  test("leaves the EET production endpoint unset without configuration", () => {
    expect(appEnv.VITE_PAYKY_EET_PRODUCTION_URL).toBeUndefined()
  })
})
