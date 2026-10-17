import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { checkRestorePhrase } from "@payky/app-shared/restore-phrase"
import { restoredAccountAtom } from "@payky/app-shared/restored-account"
import { createOrSelectAccount } from "@payky/core/evolu/device-account"
import { mnemonicToMasterKey } from "@payky/core/modules/shared/key-derivation"
import { useAtomValue, useSetAtom } from "jotai"
import { useState } from "react"
import { accountAtom } from "@/atoms/account.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { useReloadAppEvolu } from "@/hooks/use-reload-app-evolu.ts"
import { useSettingsForm } from "@/hooks/use-settings-form.ts"

interface RestoreAccount {
  readonly mnemonic: string
  readonly pending: boolean
  readonly error: TranslationKey | null
  readonly clearError: () => void
  readonly setMnemonic: (mnemonic: string) => void
  /**
   * Resolves to false when the phrase was rejected or the restore failed. On
   * success it leaves what `/restore-account` cleans up after in
   * `restoredAccountAtom`.
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

    const checked = checkRestorePhrase(mnemonic)

    if (!checked.ok) {
      setError(checked.error)
      return false
    }

    const previous = activeAccount.id
    let created = false
    try {
      await submit(async () => {
        const masterKey = await mnemonicToMasterKey(checked.mnemonic)
        created = (await createOrSelectAccount(deviceEvolu, masterKey)).created
        reloadAppEvolu()
      })
    } catch (error) {
      console.error("Failed to restore account", error)
      setError("settings.accounts.restore.failed")
      return false
    }

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
