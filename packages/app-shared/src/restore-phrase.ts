import { normalizeMnemonic } from "@payky/core/modules/account/account-utils"
import {
  type RecoveryMnemonic,
  RecoveryMnemonicSchema,
} from "@payky/core/modules/shared/key-derivation"
import type { TranslationKey } from "./i18n/resources.ts"

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
  return parsed.success
    ? { ok: true, mnemonic: parsed.data }
    : { ok: false, error: "settings.accounts.restore.mnemonic.invalid" }
}
