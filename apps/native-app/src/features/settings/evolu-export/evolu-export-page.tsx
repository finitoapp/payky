import { createEvoluExportFilename } from "@payky/app-shared/evolu-export"
import { useAtomValue } from "jotai"
import { useState } from "react"
import { Switch } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { evoluAtom } from "../../../atoms/evolu.ts"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { Screen } from "../../../components/screen.tsx"
import { Button } from "../../../components/ui/button.tsx"
import { useRequirePermission } from "../../../core/use-access.ts"
import { useToast } from "../../../hooks/use-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { createExportFolder, evoluExportShareIo } from "./evolu-export-io.ts"
import { shareEvoluExport } from "./evolu-export-share.ts"

const warningKeys = [
  "settings.evoluExport.warning.businessData",
  "settings.evoluExport.warning.payments",
  "settings.evoluExport.warning.walletMetadata",
  "settings.evoluExport.warning.localConfiguration",
  "settings.evoluExport.warning.secrets",
] as const

/** Exports the active account's app database through the system share sheet, like web's Evolu Export. */
export function EvoluExportPage() {
  const { t } = useTranslation()
  const evolu = useAtomValue(evoluAtom)
  const toast = useToast()
  const { require } = useRequirePermission()
  const [acceptedWarning, setAcceptedWarning] = useState(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [handedOff, setHandedOff] = useState(false)

  const exportDatabase = async () => {
    if (!acceptedWarning || pending) return
    // Route access alone must not hand out the data: ask before serializing.
    if (!(await require("admin", "access.action.exportDatabase"))) return

    const createdAt = new Date()
    setPending(true)
    setFailed(false)
    setHandedOff(false)
    try {
      const bytes = await evolu.exportDatabase()
      const outcome = await shareEvoluExport({
        io: evoluExportShareIo,
        bytes,
        filename: createEvoluExportFilename({ createdAt, database: "app" }),
        folder: createExportFolder(),
      })
      if (outcome === "unavailable") {
        setFailed(true)
        toast.error(t("settings.evoluExport.status.error"))
        return
      }
      // expo-sharing resolves the same for a completed share and a dismissed
      // chooser, so show a neutral status instead of success (the toast has no
      // neutral variant).
      setHandedOff(true)
    } catch {
      // The error can name paths; the screen shows only the generic failure.
      setFailed(true)
      toast.error(t("settings.evoluExport.status.error"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Screen>
      <FadeHeader title={t("settings.evoluExport.title")} />
      <YStack gap="4">
        <YStack
          gap="2"
          p="4"
          rounded="lg"
          borderWidth={1}
          borderColor="red-600"
        >
          <Text fontWeight="700">
            {t("settings.evoluExport.warning.title")}
          </Text>
          <Text color="muted-foreground">
            {t("settings.evoluExport.warning.description")}
          </Text>
          {warningKeys.map((key) => (
            <Text key={key} color="muted-foreground">
              {`• ${t(key)}`}
            </Text>
          ))}
        </YStack>

        <XStack gap="3" items="center">
          <Switch
            accessibilityLabel={t("settings.evoluExport.confirm.label")}
            value={acceptedWarning}
            disabled={pending}
            onValueChange={setAcceptedWarning}
          />
          <YStack flex={1}>
            <Text fontWeight="600">
              {t("settings.evoluExport.confirm.label")}
            </Text>
            <Text fontSize={13} color="muted-foreground">
              {t("settings.evoluExport.confirm.description")}
            </Text>
          </YStack>
        </XStack>

        <Text color="muted-foreground" accessibilityLiveRegion="polite">
          {t("settings.evoluExport.destination.capacitor")}
        </Text>
        <Button
          size="lg"
          label={t(
            pending
              ? "settings.evoluExport.action.pending"
              : "settings.evoluExport.action"
          )}
          disabled={!acceptedWarning}
          pending={pending}
          onPress={() => void exportDatabase()}
        />

        {handedOff || failed ? (
          <YStack
            gap="1"
            p="3"
            rounded="lg"
            borderWidth={1}
            borderColor="border-color"
          >
            <Text fontWeight="700">
              {t("settings.evoluExport.status.title")}
            </Text>
            {failed ? (
              <Text color="red-600" accessibilityRole="alert">
                {t("settings.evoluExport.status.error")}
              </Text>
            ) : (
              <Text color="muted-foreground">
                {t("settings.evoluExport.status.handedOff")}
              </Text>
            )}
          </YStack>
        ) : null}
      </YStack>
    </Screen>
  )
}
