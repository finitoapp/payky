import { insertDemoAccount } from "@payky/core/evolu/device-account"
import { runMutationWithCompletion } from "@payky/core/modules/shared/evolu-utils"
import { NonEmptyString255 } from "@payky/core/modules/shared/schema"
import { router } from "expo-router"
import { useAtomValue, useSetAtom } from "jotai"
import TriangleAlert from "lucide-react-native/icons/triangle-alert"
import { useState } from "react"
import { Text, YStack } from "tamagui"
import { accountAtom } from "../../../atoms/account.ts"
import { deviceEvoluAtom } from "../../../atoms/device-evolu.ts"
import { reloadAppEvoluAtom } from "../../../atoms/evolu-counter.ts"
import { AppButton } from "../../../components/app-button.tsx"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { Screen } from "../../../components/screen.tsx"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../../components/ui/alert.tsx"
import { useConfirm } from "../../../hooks/use-confirm.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

/**
 * Creates a demo account and switches to it; `DemoDataSeed` then fills it
 * with its fictional history (demo-data/0001). Existing accounts are never
 * written to, and the demo account never syncs.
 */
export function DemoDataPage() {
  const { t } = useTranslation()
  const account = useAtomValue(accountAtom)
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const reloadAppEvolu = useSetAtom(reloadAppEvoluAtom)
  const confirm = useConfirm()
  const runToast = useRunToast()
  const [pending, setPending] = useState(false)
  const accountName = t("settings.demoData.accountName")

  const create = async () => {
    if (pending) return
    const confirmed = await confirm({
      title: t("settings.demoData.confirm.title"),
      description: t("settings.demoData.confirm.description"),
      confirmLabel: t("settings.demoData.confirm.confirm"),
      cancelLabel: t("settings.demoData.confirm.cancel"),
      variant: "destructive",
    })
    if (!confirmed) return

    setPending(true)
    await runToast(async () => {
      await runMutationWithCompletion((options) =>
        insertDemoAccount(deviceEvolu, NonEmptyString255(accountName), options)
      )
      reloadAppEvolu()
      router.replace("/")
      return undefined
    })
    setPending(false)
  }

  return (
    <Screen>
      <FadeHeader title={t("settings.demoData.title")} />
      {account.demo === null ? null : (
        <YStack gap="1" accessibilityRole="alert">
          <Text fontWeight="700">{t("settings.demoData.current.title")}</Text>
          <Text color="muted-foreground">
            {t("settings.demoData.current.description")}
          </Text>
        </YStack>
      )}
      <Alert variant="destructive" icon={TriangleAlert}>
        <AlertTitle>{t("settings.demoData.warning.title")}</AlertTitle>
        <AlertDescription>
          {`• ${t("settings.demoData.warning.newAccount", { name: accountName })}`}
          {`• ${t("settings.demoData.warning.irreversible")}`}
          <Text fontSize={14} fontWeight="700">
            {`• ${t("settings.demoData.warning.relays")}`}
          </Text>
          {`• ${t("settings.demoData.warning.services")}`}
          {`• ${t("settings.demoData.warning.duration")}`}
        </AlertDescription>
      </Alert>
      <AppButton
        label={t(
          pending
            ? "settings.demoData.action.pending"
            : "settings.demoData.action"
        )}
        variant="destructive"
        pending={pending}
        onPress={() => {
          void create()
        }}
      />
    </Screen>
  )
}
