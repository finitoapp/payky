import { describe, expect, test } from "vitest"
import { z } from "zod"

import { accessPresets } from "@/core/modules/access/access-types.ts"
import {
  decodePermissions,
  decodePinHash,
  effectivePermissions,
  encodePermissions,
  hashPin,
  PinHashJson,
  PinSchema,
  recoveryPhraseMatches,
  verifyPin,
} from "@/core/modules/access/access-utils.ts"
import {
  createMasterKey,
  masterKeyToMnemonic,
} from "@/core/modules/shared/key-derivation.ts"

describe("PinSchema", () => {
  test.each(["1234", "12345678"])("accepts %s", (pin) => {
    expect(PinSchema.safeParse(pin).success).toBe(true)
  })

  test.each(["123", "123456789", "12a4", " 1234"])("rejects %s", (pin) => {
    expect(PinSchema.safeParse(pin).success).toBe(false)
  })
})

describe("PIN hash", () => {
  test("verifies the PIN it was made from, and no other", async () => {
    const stored = await hashPin(PinSchema.parse("4821"))

    await expect(verifyPin("4821", stored)).resolves.toBe(true)
    await expect(verifyPin("4822", stored)).resolves.toBe(false)
  })

  test("round-trips through its stored JSON", async () => {
    const stored = await hashPin(PinSchema.parse("4821"))

    expect(decodePinHash(z.encode(PinHashJson, stored))).toEqual(stored)
  })

  const valid = {
    salt: "00".repeat(16),
    iterations: 30_000,
    hash: "ab".repeat(32),
  }

  test.each([
    ["an unbounded iteration count", { ...valid, iterations: 1_000_000_000 }],
    ["too few iterations", { ...valid, iterations: 1 }],
    ["a short salt", { ...valid, salt: "00" }],
    ["an overlong salt", { ...valid, salt: "00".repeat(200) }],
  ])("treats %s as no PIN", (_, value) => {
    expect(decodePinHash(JSON.stringify(value))).toBeNull()
  })

  test("treats malformed JSON as no PIN", () => {
    expect(decodePinHash("{")).toBeNull()
    expect(decodePinHash(null)).toBeNull()
  })
})

describe("device permissions", () => {
  test("null is no permissions", () => {
    expect(decodePermissions(null)).toEqual(new Set())
  })

  test("an unknown permission voids the whole set", () => {
    expect(decodePermissions('["sell","fly"]')).toEqual(new Set())
  })

  test("encodes in canonical order, and nothing as null", () => {
    expect(encodePermissions(["activity", "sell"])).toBe('["sell","activity"]')
    expect(encodePermissions([])).toBeNull()
    expect(decodePermissions(encodePermissions(accessPresets.staff))).toEqual(
      new Set(accessPresets.staff)
    )
  })
})

describe("effectivePermissions", () => {
  const defaults = new Set(accessPresets.basic)

  test("are the defaults without the PIN", () => {
    expect(
      effectivePermissions({ enabled: true, defaults, session: false })
    ).toEqual(defaults)
  })

  test("are every permission with a PIN session", () => {
    expect(
      effectivePermissions({ enabled: true, defaults, session: true })
    ).toEqual(new Set(accessPresets.owner))
  })

  test("are every permission while access control is off", () => {
    expect(
      effectivePermissions({
        enabled: false,
        defaults: new Set(),
        session: false,
      })
    ).toEqual(new Set(accessPresets.owner))
  })
})

describe("recoveryPhraseMatches", () => {
  test("matches the account's phrase however it is spaced or cased", async () => {
    const masterKey = createMasterKey()
    const phrase = await masterKeyToMnemonic(masterKey)

    await expect(
      recoveryPhraseMatches(
        `  ${phrase.toUpperCase().replaceAll(" ", "  \n")} `,
        masterKey
      )
    ).resolves.toBe(true)
  })

  test("rejects another account's phrase and garbage", async () => {
    const masterKey = createMasterKey()
    const otherPhrase = await masterKeyToMnemonic(createMasterKey())

    await expect(recoveryPhraseMatches(otherPhrase, masterKey)).resolves.toBe(
      false
    )
    await expect(recoveryPhraseMatches("1234", masterKey)).resolves.toBe(false)
  })
})
