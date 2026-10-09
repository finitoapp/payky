import { useAtomValue, useSetAtom } from "jotai"
import { useState } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { createOrSelectAccount } from "@/core/evolu/device-account.ts"
import { normalizeMnemonic } from "@/core/modules/account/account-utils.ts"
import {
  mnemonicToMasterKey,
  RecoveryMnemonicSchema,
} from "@/core/modules/shared/key-derivation.ts"
import { restoredAccountAtom } from "@/features/account/restored-account.ts"
import { useSettingsForm } from "@/features/settings/use-settings-form.ts"
import { useReloadAppEvolu } from "@/hooks/use-reload-app-evolu.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

interface RestoreAccount {
  readonly mnemonic: string
  readonly pending: boolean
  readonly error: TranslationKey | null
  readonly clearError: () => void
  readonly setMnemonic: (mnemonic: string) => void
  /**
   * Resolves to false when the phrase was rejected. On success it leaves
   * what `/restore-account` cleans up after in `restoredAccountAtom`.
   */
  readonly restore: () => Promise<boolean>
}

/**
 * Validates a recovery phrase, selects its device account, and recreates the
 * app Evolu client for the selected account.
 */
export function useRestoreAccount(): RestoreAccount {
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const activeAccount = useAtomValue(accountAtom)
  const reloadAppEvolu = useReloadAppEvolu()
  const setRestoredAccount = useSetAtom(restoredAccountAtom)
  const [mnemonic, setMnemonicValue] = useState("")
  const { pending, error, setError, submit } = useSettingsForm()

  const setMnemonic = (nextMnemonic: string) => {
    setMnemonicValue(nextMnemonic)
    setError(null)
  }

  const restore = async (): Promise<boolean> => {
    setError(null)

    const normalizedMnemonic = normalizeMnemonic(mnemonic)

    if (normalizedMnemonic === "") {
      setError("settings.accounts.restore.mnemonic.required")
      return false
    }

    const mnemonicResult = RecoveryMnemonicSchema.safeParse(normalizedMnemonic)

    if (!mnemonicResult.success) {
      setError("settings.accounts.restore.mnemonic.invalid")
      return false
    }

    const previous = activeAccount.id
    let created = false
    await submit(async () => {
      const masterKey = await mnemonicToMasterKey(mnemonicResult.data)
      created = (await createOrSelectAccount(deviceEvolu, masterKey)).created
      reloadAppEvolu()
    })

    setRestoredAccount({ created, previous })
    return true
  }

  return {
    mnemonic,
    pending,
    error,
    clearError: () => {
      setError(null)
    },
    setMnemonic,
    restore,
  }
}
