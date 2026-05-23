import { createFileRoute } from "@tanstack/react-router"
import { GitFork, type Info, ScrollText, ShieldCheck } from "lucide-react"
import { type ComponentProps, useMemo } from "react"
import { FadeHeader } from "@/components/fade-header.tsx"
import { VerticalNav } from "@/components/vertial-nav.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

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
  readonly href?: string
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
    icon: GitFork,
    title: "settings.about.github.title",
    description: "settings.about.github.description",
    href: "https://github.com/finitoapp/payky",
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
      href: row.href,
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

      <div className="flex flex-col items-center gap-8 pt-8 pb-4 text-center">
        <img
          src="/icon-animated.svg"
          alt={t("settings.about.app.title")}
          className="size-40 rounded-3xl shadow"
        />
        <p className="text-sm text-muted-foreground">
          {t("settings.appVersion")} <strong>{appVersion}</strong>
        </p>
      </div>

      <VerticalNav title={t("settings.about.app.title")} items={aboutItems} />
    </>
  )
}
