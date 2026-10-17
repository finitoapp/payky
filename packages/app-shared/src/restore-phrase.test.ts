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

  test("rejects a phrase that is not a valid mnemonic", () => {
    expect(checkRestorePhrase("not a real phrase")).toEqual({
      ok: false,
      error: "settings.accounts.restore.mnemonic.invalid",
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
