import { sqliteFalse, sqliteTrue } from "@evolu/common"
import { splitTransportUrl } from "@payky/app-shared/evolu-transports"
import {
  accountTransportsQuery,
  setAccountEvoluTransportActive,
} from "@payky/core/evolu/device-account"
import type { DeviceAccountId } from "@payky/core/evolu/device-client"
import { runMutationWithCompletion } from "@payky/core/modules/shared/evolu-utils"
import { useAtomValue, useSetAtom } from "jotai"
import { useState } from "react"
import { Switch } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { deviceEvoluAtom } from "../../../atoms/device-evolu.ts"
import { reloadAppEvoluAtom } from "../../../atoms/evolu-counter.ts"
import { useDeviceEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { TransportSyncStatus } from "./transport-sync-status.tsx"

/** The account's transports with an on/off switch; a change reopens the app database. */
export function TransportList({
  accountId,
  disabled,
}: {
  readonly accountId: DeviceAccountId
  /** A demo account never syncs, so its relays cannot be switched on. */
  readonly disabled: boolean
}) {
  const { t } = useTranslation()
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const reloadAppEvolu = useSetAtom(reloadAppEvoluAtom)
  const runToast = useRunToast()
  const { data: transports } = useDeviceEvoluQuery(
    accountTransportsQuery(accountId)
  )
  const [pendingId, setPendingId] = useState<string | null>(null)

  if (transports.length === 0) {
    return (
      <Text color="muted-foreground">
        {t("settings.security.transports.empty")}
      </Text>
    )
  }

  return (
    <YStack gap="2">
      {transports.map((transport) => {
        const active = transport.isActive === sqliteTrue
        return (
          <YStack
            key={transport.id}
            gap="2"
            p="3"
            rounded="lg"
            borderWidth={1}
            borderColor="border-color"
          >
            <TransportUrl url={transport.url} muted={!active} />
            <XStack items="center" justify="space-between" gap="3">
              <YStack flex={1}>
                {active ? (
                  <TransportSyncStatus url={transport.url} />
                ) : (
                  <Text fontSize={12} color="muted-foreground">
                    {t("settings.security.transports.inactive")}
                  </Text>
                )}
              </YStack>
              <Switch
                accessibilityLabel={t("settings.security.transports.toggle", {
                  url: transport.url,
                })}
                value={active}
                disabled={disabled || pendingId !== null}
                onValueChange={(checked) => {
                  void (async () => {
                    setPendingId(transport.id)
                    await runToast(async () => {
                      await runMutationWithCompletion((options) =>
                        setAccountEvoluTransportActive(
                          deviceEvolu,
                          {
                            id: transport.id,
                            isActive: checked ? sqliteTrue : sqliteFalse,
                          },
                          options
                        )
                      )
                      reloadAppEvolu()
                      return undefined
                    })
                    setPendingId(null)
                  })()
                }}
              />
            </XStack>
          </YStack>
        )
      })}
    </YStack>
  )
}

/** The URL with its owner-id placeholder shown as what it stands for. */
function TransportUrl({
  url,
  muted,
}: {
  readonly url: string
  readonly muted: boolean
}) {
  const { t } = useTranslation()
  const { scheme, parts } = splitTransportUrl(url)

  return (
    <Text fontWeight="600" color={muted ? "muted-foreground" : "color"}>
      {scheme}
      {parts.map((part, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one URL never reorder.
        <Text key={index}>
          {index === 0
            ? null
            : `[${t("settings.security.transports.accountId")}]`}
          {part}
        </Text>
      ))}
    </Text>
  )
}
