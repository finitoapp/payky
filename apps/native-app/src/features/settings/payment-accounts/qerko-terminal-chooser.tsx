import {
  type QerkoTerminalChoice,
  selectableQerkoLocations,
} from "@payky/app-shared/qerko-terminal-flow"
import { selectQerkoTerminal } from "@payky/core/evolu/device-qerko"
import { getQerkoTerminals } from "@payky/core/integrations/qerko/qerko-client"
import { saveQerkoTerminalAccount } from "@payky/core/modules/account/account-actions"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import { getFiatCurrency } from "@payky/core/modules/app-settings/app-settings-utils"
import { qerkoPluginQuery } from "@payky/core/modules/qerko-plugin/qerko-plugin-queries"
import { NonEmptyString255Schema } from "@payky/core/modules/shared/schema"
import { useQuery } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { ActivityIndicator } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { accountAtom } from "../../../atoms/account.ts"
import { deviceEvoluAtom } from "../../../atoms/device-evolu.ts"
import { Badge } from "../../../components/ui/badge.tsx"
import { Button } from "../../../components/ui/button.tsx"
import { useAppRun } from "../../../hooks/use-app-run.ts"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

/**
 * Web's `QerkoTerminalChooser`: the terminals Qerko lists for the paired
 * company, grouped by location; choosing one makes it this device's terminal
 * (qerko/0001), written to the device database so it never syncs.
 */
export function QerkoTerminalChooser({
  enableAccount = false,
  onChosen,
}: {
  /** Also turns the payment method on, as the end of first-time pairing does. */
  readonly enableAccount?: boolean
  readonly onChosen: () => void
}) {
  const { t } = useTranslation()
  const appRun = useAppRun()
  const runToast = useRunToast()
  const account = useAtomValue(accountAtom)
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const plugin = useEvoluQuery(qerkoPluginQuery).data[0]
  const settings = useEvoluQuery(settingsQuery).data[0]

  const terminals = useQuery({
    queryKey: ["qerko", "terminals", plugin?.environment, plugin?.apiKeyName],
    enabled: plugin !== undefined,
    // A terminal activated in Qerko a moment ago must show up on reopening.
    gcTime: 0,
    queryFn: async () => {
      if (plugin === undefined) return []
      await using run = appRun()
      const result = await run(
        getQerkoTerminals({
          apiKey: plugin.apiKey,
          environment: plugin.environment,
        })
      )
      if (!result.ok) throw new Error(result.error.type)
      return selectableQerkoLocations(result.value)
    },
  })

  const choose = async (terminal: QerkoTerminalChoice) => {
    const terminalId = NonEmptyString255Schema.safeParse(terminal.terminalId)
    const terminalTid = NonEmptyString255Schema.safeParse(terminal.tid)
    const locationName = NonEmptyString255Schema.safeParse(
      terminal.locationName
    )
    if (!terminalId.success || !terminalTid.success || !locationName.success) {
      return
    }

    selectQerkoTerminal(deviceEvolu, {
      accountId: account.id,
      terminalId: terminalId.data,
      terminalTid: terminalTid.data,
      locationName: locationName.data,
    })
    if (enableAccount) {
      const saved = await runToast(async (run) => {
        await run.ok(
          saveQerkoTerminalAccount({
            enabled: true,
            currency: getFiatCurrency(settings),
          })
        )
      })
      if (!saved) return
    }
    onChosen()
  }

  if (terminals.isPending) return <ActivityIndicator />

  if (terminals.isError) {
    return (
      <YStack gap={12} items="flex-start">
        <Text fontSize="sm" lineHeight="sm" color="destructive">
          {t("settings.qerkoTerminal.terminals.failed")}
        </Text>
        <Button
          variant="outline"
          label={t("settings.qerkoTerminal.terminals.retry")}
          onPress={() => {
            void terminals.refetch()
          }}
        />
      </YStack>
    )
  }

  if (terminals.data.length === 0) {
    return (
      <Text fontSize="sm" lineHeight="sm" color="muted-foreground">
        {t("settings.qerkoTerminal.terminals.empty")}
      </Text>
    )
  }

  return (
    <YStack gap={16}>
      {terminals.data.map((location) => (
        <YStack key={location.locationId} gap={8}>
          <Text fontSize="sm" lineHeight="sm" fontWeight="500">
            {location.locationName}
          </Text>
          {location.terminals.map((terminal) => (
            <XStack
              key={terminal.terminalId}
              items="center"
              justify="space-between"
              gap={12}
              borderWidth={1}
              borderColor="border-color"
              rounded={8}
              px={12}
              py={8}
            >
              <YStack flex={1} gap={4} items="flex-start">
                <Text fontSize="sm" lineHeight="sm">
                  {terminal.tid}
                </Text>
                <Badge
                  variant="secondary"
                  label={t(
                    terminal.platform === "softPos"
                      ? "settings.qerkoTerminal.terminals.platform.softPos"
                      : "settings.qerkoTerminal.terminals.platform.physical"
                  )}
                />
              </YStack>
              <Button
                variant="outline"
                label={t("settings.qerkoTerminal.terminals.choose")}
                onPress={() => {
                  void choose(terminal)
                }}
              />
            </XStack>
          ))}
        </YStack>
      ))}
    </YStack>
  )
}
