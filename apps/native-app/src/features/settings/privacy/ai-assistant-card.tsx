import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import type { AiAssistantAccess } from "@payky/core/evolu/device-client"
import BookOpen from "lucide-react-native/icons/book-open"
import Database from "lucide-react-native/icons/database"
import PowerOff from "lucide-react-native/icons/power-off"
import { OptionToggleGroup } from "../../../components/option-toggle-group.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.tsx"
import { useRequirePermission } from "../../../core/use-access.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { usePrivacySettings } from "./use-privacy-settings.ts"

const accessOptions = [
  {
    value: "off",
    icon: PowerOff,
    title: "settings.privacy.aiAssistant.off.title",
    description: "settings.privacy.aiAssistant.off.description",
  },
  {
    value: "public",
    icon: BookOpen,
    title: "settings.privacy.aiAssistant.public.title",
    description: "settings.privacy.aiAssistant.public.description",
  },
  {
    value: "all",
    icon: Database,
    title: "settings.privacy.aiAssistant.all.title",
    description: "settings.privacy.aiAssistant.all.description",
  },
] as const satisfies ReadonlyArray<{
  readonly value: AiAssistantAccess
  readonly icon: typeof BookOpen
  readonly title: TranslationKey
  readonly description: TranslationKey
}>

/** What the AI assistant may send off this device (ai/0004); no assistant screen yet. */
export function AiAssistantCard() {
  const { t } = useTranslation()
  const { aiAssistantAccess, setAiAssistantAccess } = usePrivacySettings()
  const { require } = useRequirePermission()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.privacy.aiAssistant.title")}</CardTitle>
        <CardDescription>
          {t("settings.privacy.aiAssistant.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* It decides what leaves the device, on a `free` page (access/0002). */}
        <OptionToggleGroup
          value={aiAssistantAccess}
          options={accessOptions.map((option) => ({
            value: option.value,
            icon: option.icon,
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
      </CardContent>
    </Card>
  )
}
