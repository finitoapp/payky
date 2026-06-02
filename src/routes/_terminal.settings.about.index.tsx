import { createFileRoute } from "@tanstack/react-router"
import { type Info, Mail, ScrollText, ShieldCheck, Tag } from "lucide-react"
import { type ComponentProps, useMemo } from "react"
import { FadeHeader } from "@/components/fade-header.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { VerticalNav } from "@/components/vertial-nav.tsx"
import type { TranslationKey } from "@/i18n/resources.ts"
import { useTranslation } from "@/i18n/use-translation.ts"

export const Route = createFileRoute("/_terminal/settings/about/")({
  component: AboutPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

const appVersion = __APP_VERSION__
type VerticalNavItem = ComponentProps<typeof VerticalNav>["items"][number]

interface AboutRow {
  readonly icon: typeof Info
  readonly title: TranslationKey
  readonly description: TranslationKey
  readonly to?: VerticalNavItem["to"]
}

const aboutRows: ReadonlyArray<AboutRow> = [
  {
    icon: ShieldCheck,
    title: "settings.about.privacy.title",
    description: "settings.about.privacy.description",
    to: "/settings/about/privacy",
  },
  {
    icon: ScrollText,
    title: "settings.about.terms.title",
    description: "settings.about.terms.description",
    to: "/settings/about/terms",
  },
  {
    icon: Mail,
    title: "settings.about.contact.title",
    description: "settings.about.contact.description",
  },
]

function createAboutNavItems(
  rows: ReadonlyArray<AboutRow>,
  t: (key: TranslationKey) => string
): ComponentProps<typeof VerticalNav>["items"] {
  return rows.map((row) => {
    const Icon = row.icon

    return {
      label: (
        <span className="flex flex-col gap-1">
          <span className="text-sm font-semibold">{t(row.title)}</span>
          <span className="text-xs leading-snug text-muted-foreground">
            {t(row.description)}
          </span>
        </span>
      ),
      to: row.to,
      icon: <Icon className="text-muted-foreground" />,
    }
  })
}

function AboutPage() {
  const { t } = useTranslation()
  const aboutItems = useMemo(() => createAboutNavItems(aboutRows, t), [t])

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.about.title")} />

      <VerticalNav title={t("settings.about.app.title")} items={aboutItems} />

      <div className="flex items-center justify-between gap-4 rounded-md bg-card px-4 py-3 shadow">
        <span className="flex items-center gap-3">
          <Tag className="text-muted-foreground" />
          <span className="text-sm font-medium">
            {t("settings.about.version.title")}
          </span>
        </span>
        <Badge variant="secondary">{appVersion}</Badge>
      </div>
    </>
  )
}
