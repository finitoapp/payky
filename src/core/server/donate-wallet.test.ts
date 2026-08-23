import { afterEach, describe, expect, test, vi } from "vitest"

import { loadDonateWalletConfig } from "./donate-wallet.ts"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("loadDonateWalletConfig", () => {
  test("returns the mnemonic when the env var is set", () => {
    vi.stubEnv("PAYKY_DONATE_SPARK_MNEMONIC", "word ".repeat(24).trim())

    expect(loadDonateWalletConfig()).toEqual({
      mnemonic: "word ".repeat(24).trim(),
    })
  })

  test("returns null when the env var is missing", () => {
    vi.stubEnv("PAYKY_DONATE_SPARK_MNEMONIC", undefined)

    expect(loadDonateWalletConfig()).toBeNull()
  })

  test("returns null when the env var is blank", () => {
    vi.stubEnv("PAYKY_DONATE_SPARK_MNEMONIC", "   ")

    expect(loadDonateWalletConfig()).toBeNull()
  })
})
