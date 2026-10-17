import type { DisposableRun, LockManagerDep } from "@evolu/common"
import { lockManager } from "@evolu/react-native"
import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import {
  createDateDep,
  type DateDep,
  type EvoluOwnerDep,
  type FetchDep,
  type MasterKeyDep,
} from "@payky/core/deps"
import type {
  DeviceEvoluDep,
  EvoluDep,
} from "@payky/core/modules/shared/evolu-deps"
import { useAtomValue } from "jotai"
import { useCallback } from "react"
import { accountAtom } from "../atoms/account.ts"
import { deviceEvoluAtom } from "../atoms/device-evolu.ts"
import { evoluAtom } from "../atoms/evolu.ts"
import { nativeRun } from "../core/native-runtime.ts"
import { createFetchDep } from "../platform/native-deps.ts"
import { useToast } from "./use-toast.ts"
import { useTranslation } from "./use-translation.ts"

/** What a native run carries: the account's Evolu clients, key, locks, clock, fetch. */
export type NativeRunToastDeps = EvoluDep &
  DeviceEvoluDep &
  EvoluOwnerDep &
  MasterKeyDep &
  LockManagerDep &
  DateDep &
  FetchDep

/**
 * Native `useRunToast`, same protocol as the web hook: owns the
 * `await using run` scope; `action` returns a `TranslationKey` for a specific
 * failure toast or falls off the end on success; a throw or rejection (e.g.
 * `run.ok`/`run.orThrow` on failure) gets the generic `app.saveFailed` toast.
 * Resolves `true` only when `action` completed without a message.
 */
export function useRunToast() {
  const { t } = useTranslation()
  const toast = useToast()
  const evolu = useAtomValue(evoluAtom)
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const account = useAtomValue(accountAtom)

  return useCallback(
    async (
      action: (
        run: DisposableRun<NativeRunToastDeps>
      ) => Promise<TranslationKey | undefined>
    ): Promise<boolean> => {
      try {
        await using run = nativeRun.create<NativeRunToastDeps>({
          lockManager,
          evolu,
          deviceEvolu,
          evoluOwner: evolu.appOwner,
          masterKey: account.masterKey,
          ...createDateDep(),
          ...createFetchDep(),
        })
        const errorKey = await action(run)
        if (errorKey !== undefined) {
          toast.error(t(errorKey))
          return false
        }
        return true
      } catch {
        toast.error(t("app.saveFailed"))
        return false
      }
    },
    [evolu, deviceEvolu, account, toast, t]
  )
}
