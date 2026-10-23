import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import {
  describeQerkoTerminalStatus,
  qerkoCountryLabelKeys,
  qerkoEnvironmentLabelKeys,
} from "@payky/app-shared/qerko-terminal-flow"
import {
  clearQerkoTerminal,
  qerkoTerminalSelectionQuery,
} from "@payky/core/evolu/device-qerko"
import { getQerkoTerminalStatus } from "@payky/core/integrations/qerko/qerko-client"
import { saveQerkoTerminalAccount } from "@payky/core/modules/account/account-actions"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import { getFiatCurrency } from "@payky/core/modules/app-settings/app-settings-utils"
import type { QerkoPluginRow } from "@payky/core/modules/qerko-plugin/qerko-plugin"
import { deleteQerkoPlugin } from "@payky/core/modules/qerko-plugin/qerko-plugin-actions"
import { qerkoPluginQuery } from "@payky/core/modules/qerko-plugin/qerko-plugin-queries"
import { useAtomValue } from "jotai"
import ChevronDown from "lucide-react-native/icons/chevron-down"
import ChevronUp from "lucide-react-native/icons/chevron-up"
import { useState } from "react"
import { Text, XStack, YStack } from "tamagui"
import { accountAtom } from "../../../atoms/account.ts"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { Screen } from "../../../components/screen.tsx"
import { Alert, AlertDescription } from "../../../components/ui/alert.tsx"
import { Button } from "../../../components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.tsx"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  useCollapsible,
} from "../../../components/ui/collapsible.tsx"
import { Icon } from "../../../components/ui/icon.tsx"
import { useAppRun } from "../../../hooks/use-app-run.ts"
import { useConfirm } from "../../../hooks/use-confirm.ts"
import {
  useDeviceEvoluQuery,
  useEvoluQuery,
} from "../../../hooks/use-evolu-query.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { QerkoPairingWizard } from "./qerko-pairing-wizard.tsx"
import { QerkoTerminalChooser } from "./qerko-terminal-chooser.tsx"

/**
 * The Qerko card terminal's settings, as web's `QerkoTerminalSettingsPage`:
 * the pairing wizard until the company is paired, then what is paired, the
 * terminal this device pays on and a way to unpair.
 */
export function QerkoTerminalSettingsPage() {
  const { t } = useTranslation()
  const plugin = useEvoluQuery(qerkoPluginQuery).data[0]
  // Pairing saves the key, which would swap the wizard for the paired view
  // before the terminal is chosen.
  const [finishingPairing, setFinishingPairing] = useState(false)

  return (
    <Screen>
      <FadeHeader title={t("settings.qerkoTerminal.title")} />
      {plugin === undefined || finishingPairing ? (
        <QerkoPairingWizard
          onPaired={() => {
            setFinishingPairing(true)
          }}
          onFinished={() => {
            setFinishingPairing(false)
          }}
        />
      ) : (
        <QerkoPairedView plugin={plugin} />
      )}
    </Screen>
  )
}

function QerkoPairedView({ plugin }: { readonly plugin: QerkoPluginRow }) {
  const { t } = useTranslation()
  const appRun = useAppRun()
  const runToast = useRunToast()
  const confirm = useConfirm()
  const account = useAtomValue(accountAtom)
  const settings = useEvoluQuery(settingsQuery).data[0]
  const selection = useDeviceEvoluQuery(qerkoTerminalSelectionQuery(account.id))
    .data[0]
  const [choosing, setChoosing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    readonly key: TranslationKey
    readonly ok: boolean
  } | null>(null)

  const test = async () => {
    if (selection === undefined) return
    setTesting(true)
    setTestResult(null)
    await using run = appRun()
    const result = await run(
      getQerkoTerminalStatus({
        credentials: { apiKey: plugin.apiKey, environment: plugin.environment },
        terminalId: selection.terminalId,
      })
    )
    setTesting(false)
    setTestResult(
      result.ok
        ? describeQerkoTerminalStatus(result.value)
        : { key: "settings.qerkoTerminal.error.unreachable", ok: false }
    )
  }

  const unpair = async () => {
    const confirmed = await confirm({
      title: t("settings.qerkoTerminal.unpair.confirm.title"),
      description: t("settings.qerkoTerminal.unpair.confirm.description"),
      confirmLabel: t("settings.qerkoTerminal.unpair.confirm.confirm"),
      cancelLabel: t("settings.qerkoTerminal.unpair.confirm.cancel"),
      variant: "destructive",
    })
    if (!confirmed) return

    await runToast(async (run) => {
      await run.ok(deleteQerkoPlugin())
      await run.ok(
        saveQerkoTerminalAccount({
          enabled: false,
          currency: getFiatCurrency(settings),
        })
      )
      clearQerkoTerminal(run.deps.deviceEvolu, account.id)
    })
  }

  return (
    <YStack gap={16}>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.qerkoTerminal.paired.title")}</CardTitle>
          <CardDescription>
            {t("settings.qerkoTerminal.paired.description")}
          </CardDescription>
        </CardHeader>
        <CardContent gap={16}>
          <YStack gap={8}>
            <Row
              label={t("settings.qerkoTerminal.paired.company")}
              value={`${plugin.legalEntityName} (${plugin.identificationNumber}, ${t(
                qerkoCountryLabelKeys[plugin.country]
              )})`}
            />
            <Row
              label={t("settings.qerkoTerminal.terminal.label")}
              value={
                selection === undefined
                  ? t("settings.qerkoTerminal.terminal.none")
                  : `${selection.locationName} · ${selection.terminalTid}`
              }
            />
          </YStack>

          {choosing ? (
            <QerkoTerminalChooser
              onKeyRejected={() => {
                void unpair()
              }}
              onChosen={() => {
                setChoosing(false)
                setTestResult(null)
              }}
            />
          ) : null}

          {testResult === null ? null : (
            <Alert variant={testResult.ok ? "success" : "destructive"}>
              <AlertDescription>{t(testResult.key)}</AlertDescription>
            </Alert>
          )}

          <Collapsible>
            <CollapsibleTrigger>
              <AdvancedSettingsLabel
                label={t("settings.qerkoTerminal.advanced")}
              />
            </CollapsibleTrigger>
            <CollapsibleContent pt="4">
              <YStack gap={8}>
                <Row
                  label={t("settings.qerkoTerminal.paired.keyName")}
                  value={plugin.apiKeyName}
                />
                <Row
                  label={t("settings.qerkoTerminal.environment.label")}
                  value={t(qerkoEnvironmentLabelKeys[plugin.environment])}
                />
                <Text fontSize="xs" lineHeight="xs" color="muted-foreground">
                  {t("settings.qerkoTerminal.paired.environmentReadOnly")}
                </Text>
              </YStack>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
        <CardFooter gap={8}>
          <Button
            variant="destructive"
            label={t("settings.qerkoTerminal.unpair.action")}
            onPress={() => {
              void unpair()
            }}
          />
          <Button
            variant="outline"
            label={t(
              selection === undefined
                ? "settings.qerkoTerminal.terminal.choose"
                : "settings.qerkoTerminal.terminal.change"
            )}
            onPress={() => {
              setChoosing((open) => !open)
            }}
          />
          <Button
            label={t("settings.qerkoTerminal.test.action")}
            pending={testing}
            disabled={selection === undefined}
            onPress={() => {
              void test()
            }}
          />
        </CardFooter>
      </Card>
    </YStack>
  )
}

function Row({
  label,
  value,
}: {
  readonly label: string
  readonly value: string
}) {
  return (
    <XStack gap={16} justify="space-between">
      <Text fontSize="sm" lineHeight="sm" color="muted-foreground">
        {label}
      </Text>
      <Text flex={1} fontSize="sm" lineHeight="sm" text="right">
        {value}
      </Text>
    </XStack>
  )
}

function AdvancedSettingsLabel({ label }: { readonly label: string }) {
  const { open } = useCollapsible()
  return (
    <XStack items="center" justify="space-between" w="100%">
      <Text fontSize="sm" lineHeight="sm" fontWeight="600">
        {label}
      </Text>
      <Icon icon={open ? ChevronUp : ChevronDown} color="muted-foreground" />
    </XStack>
  )
}
