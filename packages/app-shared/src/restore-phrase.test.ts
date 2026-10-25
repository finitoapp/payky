import { createAccountMasterKey } from "@payky/core/evolu/device-account"
import { masterKeyToMnemonic } from "@payky/core/modules/shared/key-derivation"
import { describe, expect, test } from "vitest"
import { checkRestorePhrase } from "./restore-phrase.ts"

describe("checkRestorePhrase", () => {
  test("rejects an empty or blank phrase as required", () => {
    for (const input of ["", "   \n "]) {
      expect(checkRestorePhrase(input)).toEqual({
        ok: false,
        error: "settings.accounts.restore.mnemonic.required",
      })
    }
  })

  test("rejects a word count other than 20", () => {
    expect(checkRestorePhrase("academic acid acne")).toEqual({
      ok: false,
      error: "settings.accounts.restore.mnemonic.wordCount",
    })
  })

  test("rejects a seed from another wallet", () => {
    const twelve = Array.from({ length: 12 }, () => "abandon").join(" ")
    for (const input of [twelve, "abandon ability able"]) {
      expect(checkRestorePhrase(input)).toEqual({
        ok: false,
        error: "settings.accounts.restore.mnemonic.foreign",
      })
    }
  })

  test("rejects 20 unknown words as invalid", () => {
    expect(
      checkRestorePhrase(Array.from({ length: 20 }, () => "zzzz").join(" "))
    ).toEqual({
      ok: false,
      error: "settings.accounts.restore.mnemonic.invalid",
    })
  })

  test("rejects 20 valid words with a bad checksum", async () => {
    const phrase = await masterKeyToMnemonic(createAccountMasterKey())
    const words = phrase.split(" ")
    words[19] = words[19] === "academic" ? "acid" : "academic"
    expect(checkRestorePhrase(words.join(" "))).toEqual({
      ok: false,
      error: "settings.accounts.restore.mnemonic.checksum",
    })
  })

  test("normalizes whitespace of a valid phrase", async () => {
    const phrase = await masterKeyToMnemonic(createAccountMasterKey())
    expect(checkRestorePhrase(`  ${phrase.replaceAll(" ", "  ")}\n`)).toEqual({
      ok: true,
      mnemonic: phrase,
    })
  })
})
