import { getRandomValues } from "expo-crypto"
import { afterEach, expect, test, vi } from "vitest"

const startup = vi.hoisted(() => ({ roundedAmount: 0 }))

// The native boundary uses Node's CSPRNG in this test; devices use Expo Crypto.
vi.mock("expo-crypto", () => {
  const webcrypto = globalThis.crypto
  return {
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
    randomUUID: webcrypto.randomUUID.bind(webcrypto),
  }
})

vi.mock("expo-router/entry", async () => {
  const { checkSharedLogic } = await import("../core/check-shared-logic.ts")
  startup.roundedAmount = checkSharedLogic()
  return {}
})

afterEach(() => vi.unstubAllGlobals())

test("installs secure randomness before the router imports shared domain code", async () => {
  vi.stubGlobal("crypto", undefined)

  await import("../../entry.ts")

  expect(globalThis.crypto.getRandomValues).toBe(getRandomValues)
  expect(globalThis.crypto.getRandomValues(new Uint8Array(16))).toHaveLength(16)
  expect(startup.roundedAmount).toBe(12300)
})
