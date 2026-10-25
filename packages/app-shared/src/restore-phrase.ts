import { normalizeMnemonic } from "@payky/core/modules/account/account-utils"
import {
  type RecoveryMnemonic,
  RecoveryMnemonicSchema,
} from "@payky/core/modules/shared/key-derivation"
import type { TranslationKey } from "./i18n/resources.ts"
import {
  analyzeRestoreWords,
  detectForeignSeed,
  RESTORE_WORD_COUNT,
  splitPhraseInput,
} from "./restore-words.ts"

type RestorePhraseCheck =
  | { readonly ok: true; readonly mnemonic: RecoveryMnemonic }
  | { readonly ok: false; readonly error: TranslationKey }

/** Normalizes and validates a typed recovery phrase, as the restore forms do. */
export function checkRestorePhrase(input: string): RestorePhraseCheck {
  const normalized = normalizeMnemonic(input)
  if (normalized === "") {
    return { ok: false, error: "settings.accounts.restore.mnemonic.required" }
  }
  const parsed = RecoveryMnemonicSchema.safeParse(normalized)
  if (parsed.success) return { ok: true, mnemonic: parsed.data }

  const words = splitPhraseInput(normalized)
  if (detectForeignSeed(words)) {
    return { ok: false, error: "settings.accounts.restore.mnemonic.foreign" }
  }
  if (words.length !== RESTORE_WORD_COUNT) {
    return { ok: false, error: "settings.accounts.restore.mnemonic.wordCount" }
  }
  const allKnown = analyzeRestoreWords(words, null).isComplete
  return {
    ok: false,
    error: allKnown
      ? "settings.accounts.restore.mnemonic.checksum"
      : "settings.accounts.restore.mnemonic.invalid",
  }
}
