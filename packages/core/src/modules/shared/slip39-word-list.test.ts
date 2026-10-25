import { describe, expect, test } from "vitest"
import { createAccountMasterKey } from "../../evolu/device-account.ts"
import { masterKeyToMnemonic } from "./key-derivation.ts"
import { Slip39WordList } from "./slip39-word-list.ts"

describe("Slip39WordList", () => {
  test("holds 1024 distinct words", () => {
    expect(Slip39WordList).toHaveLength(1024)
    expect(new Set(Slip39WordList).size).toBe(1024)
  })

  test("contains every word of generated recovery phrases", async () => {
    for (let i = 0; i < 5; i += 1) {
      const phrase = await masterKeyToMnemonic(createAccountMasterKey())
      const words = phrase.split(" ")
      expect(words).toHaveLength(20)
      for (const word of words) expect(Slip39WordList).toContain(word)
    }
  })
})
