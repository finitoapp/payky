import { useAtomValue } from "jotai"
import { useState } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { createOrSelectAccount } from "@/core/evolu/device-account.ts"
import type { AccountId } from "@/core/evolu/device-client.ts"
import { normalizeMnemonic } from "@/core/modules/account/account-utils.ts"
import {
  mnemonicToMasterKey,
  RecoveryMnemonicSchema,
} from "@/core/modules/shared/key-derivation.ts"
import { useSettingsForm } from "@/features/settings/use-settings-form.ts"
import { useReloadAppEvolu } from "@/hooks/use-reload-app-evolu.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

interface RestoredAccount {
  /** Whether the phrase's account was new to this device, not just selected. */
  readonly created: boolean
  /** The account that was active before the restore. */
  readonly previous: AccountId
}

interface RestoreAccount {
  readonly mnemonic: string
  readonly pending: boolean
  readonly error: TranslationKey | null
  readonly clearError: () => void
  readonly setMnemonic: (mnemonic: string) => void
  /** Resolves to null when the phrase was rejected. */
  readonly restore: () => Promise<RestoredAccount | null>
}

/**
 * Validates a recovery phrase, selects its device account, and recreates the
 * app Evolu client for the selected account.
 */
export function useRestoreAccount(): RestoreAccount {
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const activeAccount = useAtomValue(accountAtom)
  const reloadAppEvolu = useReloadAppEvolu()
  const [mnemonic, setMnemonicValue] = useState("")
  const { pending, error, setError, submit } = useSettingsForm()

  const setMnemonic = (nextMnemonic: string) => {
    setMnemonicValue(nextMnemonic)
    setError(null)
  }

  const restore = async (): Promise<RestoredAccount | null> => {
    setError(null)

    const normalizedMnemonic = normalizeMnemonic(mnemonic)

    if (normalizedMnemonic === "") {
      setError("settings.accounts.restore.mnemonic.required")
      return null
    }

    const mnemonicResult = RecoveryMnemonicSchema.safeParse(normalizedMnemonic)

    if (!mnemonicResult.success) {
      setError("settings.accounts.restore.mnemonic.invalid")
      return null
    }

    const previous = activeAccount.id
    let created = false
    await submit(async () => {
      const masterKey = await mnemonicToMasterKey(mnemonicResult.data)
      created = (await createOrSelectAccount(deviceEvolu, masterKey)).created
      reloadAppEvolu()
    })

    return { created, previous }
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
