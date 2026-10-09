import { BookOpen, Database, PowerOff } from "lucide-react"

import { OptionToggleGroup } from "@/components/option-toggle-group.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import type { AiAssistantAccess } from "@/core/evolu/device-client.ts"
import { useRequirePermission } from "@/hooks/use-access.ts"
import {
  useAiAssistantAccess,
  useSetAiAssistantAccess,
} from "@/hooks/use-ai-assistant-access.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

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

/** What the AI assistant may send off this device (ai/0004). */
export function AiAssistantCard() {
  const { t } = useTranslation()
  const access = useAiAssistantAccess()
  const setAccess = useSetAiAssistantAccess()
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
        <OptionToggleGroup
          value={access}
          options={accessOptions.map((option) => ({
            value: option.value,
            icon: option.icon,
            title: t(option.title),
            description: t(option.description),
          }))}
          // It decides what leaves the device, on a `free` page (access/0002).
          onChange={(next) => {
            void (async () => {
              if (await require("admin", "access.action.aiAccess")) {
                setAccess(next)
              }
            })()
          }}
        />
      </CardContent>
    </Card>
  )
}
