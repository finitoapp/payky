import { formatDateTime } from "@payky/app-shared/format-date"
import {
  accountListQuery,
  createAccountMasterKey,
  createOrSelectAccount,
  removeDeviceAccount,
  selectAccount,
} from "@payky/core/evolu/device-account"
import type { DeviceAccountId } from "@payky/core/evolu/device-client"
import { router } from "expo-router"
import { useAtomValue, useSetAtom, useStore } from "jotai"
import { useState } from "react"
import { Text, XStack, YStack } from "tamagui"
import { accountAtom } from "../../../atoms/account.ts"
import { deviceEvoluAtom } from "../../../atoms/device-evolu.ts"
import {
  evoluCounterAtom,
  reloadAppEvoluAtom,
} from "../../../atoms/evolu-counter.ts"
import { AppButton } from "../../../components/app-button.tsx"
import { Screen } from "../../../components/screen.tsx"
import { ScreenHeader } from "../../../components/screen-header.tsx"
import { useRequirePermission } from "../../../core/use-access.ts"
import { useConfirm } from "../../../hooks/use-confirm.ts"
import { useDeviceEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

/**
 * Which accounts this device has and which one is active, plus the ways to
 * add another or open this one elsewhere. Switching and removing are governed
 * by the active account's `admin`; the other account's PIN is never asked
 * (access/0002). Restoring from a phrase stays in onboarding for now.
 */
export function AccountsSettingsPage() {
  const { language, t } = useTranslation()
  const confirm = useConfirm()
  const { require } = useRequirePermission()
  const store = useStore()
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const activeAccount = useAtomValue(accountAtom)
  const accountVersion = useAtomValue(evoluCounterAtom)
  const reload = useSetAtom(reloadAppEvoluAtom)
  const { data: accounts } = useDeviceEvoluQuery(accountListQuery)
  const [busy, setBusy] = useState(false)
  const stale = () => store.get(evoluCounterAtom) !== accountVersion

  const activate = async (accountId: DeviceAccountId) => {
    if (accountId === activeAccount.id || stale()) return
    if (!(await require("admin", "access.action.switchAccount"))) return
    if (stale()) return
    selectAccount(deviceEvolu, accountId)
    reload()
  }

  const remove = async (accountId: DeviceAccountId, name: string) => {
    if (accountId === activeAccount.id || stale()) return
    if (!(await require("admin", "access.action.removeAccount"))) return
    // Confirmed because there is no undo: the row is only soft-deleted and
    // the way back is re-entering the recovery phrase.
    const confirmed = await confirm({
      title: t("settings.accounts.remove.confirm.title", { name }),
      description: t("settings.accounts.remove.confirm.description"),
      confirmLabel: t("settings.accounts.remove.confirm.confirm"),
      cancelLabel: t("settings.accounts.remove.confirm.cancel"),
      variant: "destructive",
    })
    if (!confirmed || stale()) return
    removeDeviceAccount(deviceEvolu, accountId)
  }

  const createNew = async () => {
    if (busy || stale()) return
    const confirmed = await confirm({
      title: t("settings.accounts.create.confirm.title"),
      description: t("settings.accounts.create.confirm.description", {
        name: activeAccount.name,
      }),
      confirmLabel: t("settings.accounts.create.confirm.confirm"),
      cancelLabel: t("settings.accounts.create.confirm.cancel"),
    })
    if (!confirmed || stale()) return
    setBusy(true)
    try {
      await createOrSelectAccount(deviceEvolu, createAccountMasterKey())
      reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <ScreenHeader title={t("settings.accounts.title")} />
      <YStack gap="3">
        <Text fontWeight="700">{t("settings.accounts.list.title")}</Text>
        {accounts.length === 0 ? (
          <Text color="muted-foreground">
            {t("settings.accounts.list.empty")}
          </Text>
        ) : (
          accounts.map((account) => {
            const active = account.id === activeAccount.id
            return (
              <YStack
                key={account.id}
                gap="2"
                p="3"
                rounded="lg"
                borderWidth={1}
                borderColor={active ? "primary" : "border-color"}
              >
                <XStack items="center" gap="2">
                  <YStack flex={1}>
                    <Text fontWeight="600" numberOfLines={1}>
                      {account.name}
                    </Text>
                    <Text fontSize="sm" color="muted-foreground">
                      {`${t("settings.accounts.list.createdAt")} ${formatDateTime(new Date(account.createdAt), language)}`}
                    </Text>
                  </YStack>
                  {active ? (
                    <Text fontWeight="600">
                      {t("settings.accounts.list.active")}
                    </Text>
                  ) : null}
                </XStack>
                {active ? null : (
                  <XStack gap="2">
                    <YStack flex={1}>
                      <AppButton
                        label={t("settings.accounts.list.switch")}
                        variant="secondary"
                        disabled={busy}
                        onPress={() => {
                          void activate(account.id)
                        }}
                      />
                    </YStack>
                    <YStack flex={1}>
                      <AppButton
                        label={t("settings.accounts.list.remove")}
                        variant="destructive"
                        disabled={busy}
                        onPress={() => {
                          void remove(account.id, account.name)
                        }}
                      />
                    </YStack>
                  </XStack>
                )}
              </YStack>
            )
          })
        )}
      </YStack>

      <YStack gap="3">
        <Text fontWeight="700">{t("settings.accounts.add.title")}</Text>
        <AppButton
          label={t("accountChoice.new.title")}
          variant="secondary"
          pending={busy}
          onPress={() => {
            void createNew()
          }}
        />
        <AppButton
          label={t("accountChoice.transfer.title")}
          variant="secondary"
          disabled={busy}
          onPress={() => router.push("/pair")}
        />
      </YStack>

      <YStack gap="3">
        <Text fontWeight="700">{t("settings.accounts.elsewhere.title")}</Text>
        <Text color="muted-foreground">
          {t("accountTransfer.settings.source.description")}
        </Text>
        <AppButton
          label={t("accountTransfer.settings.source.title")}
          variant="secondary"
          disabled={busy}
          onPress={() => router.push("/settings/access/add-device")}
        />
      </YStack>
    </Screen>
  )
}
