import {
  ArrowDownIcon,
  LanguagesIcon,
  type LucideIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
} from "lucide-react"

import { flushSync } from "react-dom"

import type { Theme } from "@/components/theme-provider.tsx"
import { buttonVariants } from "@/components/ui/button.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx"
import { useLandingTranslation } from "@/features/landing/landing-translation.ts"
import { useLandingTheme } from "@/features/landing/use-landing-theme.ts"
import { landingPaths } from "@/features/shared/landing-redirect.ts"
import { languageOptions } from "@/features/shared/language-options.ts"
import type { Language, TranslationKey } from "@/i18n/resources.ts"
import { cn } from "@/lib/utils.ts"

const themeIcons = {
  system: MonitorIcon,
  light: SunIcon,
  dark: MoonIcon,
} satisfies Record<Theme, LucideIcon>

const themeLabelKeys = {
  system: "settings.theme.system.title",
  light: "settings.theme.light.title",
  dark: "settings.theme.dark.title",
} satisfies Record<Theme, TranslationKey>

/** Auto, light, dark, and round again, as the app's own setting does. */
const nextTheme = {
  system: "light",
  light: "dark",
  dark: "system",
} satisfies Record<Theme, Theme>

const iconButtonClassName = cn(
  buttonVariants({ variant: "ghost", size: "icon-lg" }),
  "rounded-full text-muted-foreground hover:text-foreground"
)

/**
 * Applies a theme change as a circle growing out of `origin` (landing.css),
 * or at once where View Transitions are missing or motion is reduced.
 */
function switchTheme(origin: Element, apply: () => void) {
  if (
    typeof document.startViewTransition !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    apply()
    return
  }
  const rect = origin.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  )
  const root = document.documentElement.style
  root.setProperty("--landing-theme-x", `${x}px`)
  root.setProperty("--landing-theme-y", `${y}px`)
  root.setProperty("--landing-theme-r", `${radius}px`)
  // Synchronous, so the `dark` class is on before the new snapshot is taken.
  document.startViewTransition(() => flushSync(apply))
}

/**
 * Brand on the left; on the right the one action, the language and the
 * appearance. No section links: the page reads top to bottom, and the
 * action at its end is what the header's button jumps to.
 */
export function LandingHeader() {
  const { language, setLanguage, t } = useLandingTranslation()
  const [theme, setTheme] = useLandingTheme()
  const ThemeIcon = themeIcons[theme]
  const themeLabel = `${t("landing.theme.label")}: ${t(themeLabelKeys[theme])}`

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a
          href={landingPaths[language]}
          className="inline-flex shrink-0 items-center gap-2.5 text-lg font-bold tracking-tight"
          aria-label={t("app.name")}
        >
          <img src="/pwa-icon.svg" alt="" className="size-8 shrink-0" />
          <span>{t("app.name")}</span>
        </a>

        <div className="flex items-center gap-1">
          <a
            href="#get-started"
            className={cn(
              buttonVariants({ size: "lg" }),
              "mr-2 rounded-full px-4 font-semibold max-sm:size-9 max-sm:px-0 has-data-[icon=inline-start]:pl-3.5 max-sm:has-data-[icon=inline-start]:pl-0"
            )}
            aria-label={t("landing.cta.howTo")}
            title={t("landing.cta.howTo")}
          >
            <ArrowDownIcon aria-hidden="true" data-icon="inline-start" />
            <span className="max-sm:sr-only">{t("landing.cta.howTo")}</span>
          </a>

          <DropdownMenu>
            <DropdownMenuTrigger
              className={iconButtonClassName}
              aria-label={t("landing.language.label")}
              title={t("landing.language.label")}
            >
              <LanguagesIcon aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuRadioGroup
                value={language}
                onValueChange={(value) => setLanguage(value as Language)}
              >
                {languageOptions.map((option) => (
                  <DropdownMenuRadioItem
                    key={option.value}
                    value={option.value}
                    className="py-1.5"
                  >
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            className={iconButtonClassName}
            aria-label={themeLabel}
            title={themeLabel}
            onClick={(event) =>
              switchTheme(event.currentTarget, () => setTheme(nextTheme[theme]))
            }
          >
            <ThemeIcon aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  )
}
