import { Mnemonic } from "@evolu/common"
import { useAtomValue } from "jotai"
import { useState } from "react"

import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { restoreOrSelectAccount } from "@/core/evolu/device-account.ts"
import { normalizeMnemonic } from "@/core/modules/account/account-utils.ts"
import { useSettingsForm } from "@/features/settings/use-settings-form.ts"
import { useReloadAppEvolu } from "@/hooks/use-reload-app-evolu.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export interface RestoreAccount {
  readonly mnemonic: string
  readonly pending: boolean
  readonly error: TranslationKey | null
  readonly clearError: () => void
  readonly setMnemonic: (mnemonic: string) => void
  readonly restore: () => Promise<boolean>
}

/**
 * Validates a recovery phrase, selects its device account, and recreates the
 * app Evolu client for the selected account.
 */
export function useRestoreAccount(): RestoreAccount {
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const reloadAppEvolu = useReloadAppEvolu()
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

    const mnemonicResult = Mnemonic.from(normalizedMnemonic)

    if (!mnemonicResult.ok) {
      setError("settings.accounts.restore.mnemonic.invalid")
      return false
    }

    await submit(async () => {
      await restoreOrSelectAccount(deviceEvolu, mnemonicResult.value)
      reloadAppEvolu()
    })

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
