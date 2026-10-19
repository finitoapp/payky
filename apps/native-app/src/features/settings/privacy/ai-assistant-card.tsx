import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import type { AiAssistantAccess } from "@payky/core/evolu/device-client"
import { Text, YStack } from "tamagui"
import { OptionToggleGroup } from "../../../components/option-toggle-group.tsx"
import { useRequirePermission } from "../../../core/use-access.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { usePrivacySettings } from "./use-privacy-settings.ts"

const accessOptions = [
  {
    value: "off",
    title: "settings.privacy.aiAssistant.off.title",
    description: "settings.privacy.aiAssistant.off.description",
  },
  {
    value: "public",
    title: "settings.privacy.aiAssistant.public.title",
    description: "settings.privacy.aiAssistant.public.description",
  },
  {
    value: "all",
    title: "settings.privacy.aiAssistant.all.title",
    description: "settings.privacy.aiAssistant.all.description",
  },
] as const satisfies ReadonlyArray<{
  readonly value: AiAssistantAccess
  readonly title: TranslationKey
  readonly description: TranslationKey
}>

/** What the AI assistant may send off this device (ai/0004); no assistant screen yet. */
export function AiAssistantCard() {
  const { t } = useTranslation()
  const { aiAssistantAccess, setAiAssistantAccess } = usePrivacySettings()
  const { require } = useRequirePermission()

  return (
    <YStack
      gap="3"
      p="4"
      rounded="lg"
      borderWidth={1}
      borderColor="border-color"
    >
      <Text fontWeight="700">{t("settings.privacy.aiAssistant.title")}</Text>
      <Text color="muted-foreground">
        {t("settings.privacy.aiAssistant.description")}
      </Text>
      {/* It decides what leaves the device, on a `free` page (access/0002). */}
      <OptionToggleGroup
        value={aiAssistantAccess}
        options={accessOptions.map((option) => ({
          value: option.value,
          title: t(option.title),
          description: t(option.description),
        }))}
        onChange={(next) => {
          void (async () => {
            if (await require("admin", "access.action.aiAccess")) {
              setAiAssistantAccess(next)
            }
          })()
        }}
      />
    </YStack>
  )
}
