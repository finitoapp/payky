import { useEffect } from "react"
import { z } from "zod"

import type { Theme } from "@/components/theme-provider.tsx"
import { useLocalStorageState } from "@/hooks/use-local-storage-state.ts"

/** Read before first paint by `landing.html`'s inline script too. */
const landingThemeStorageKey = "payky.landingTheme"

const ThemeSchema: z.ZodType<Theme> = z.enum(["system", "light", "dark"])

/**
 * The landing page's own appearance (landing/0002): the app's theme lives in
 * the device database, which this page does not load, so the choice made
 * here is kept for the landing page alone.
 */
export function useLandingTheme() {
  const [theme, setTheme] = useLocalStorageState<Theme>(
    landingThemeStorageKey,
    "system",
    ThemeSchema
  )

  useEffect(() => {
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => {
      document.documentElement.classList.toggle(
        "dark",
        theme === "dark" || (theme === "system" && systemDark.matches)
      )
    }
    apply()
    systemDark.addEventListener("change", apply)
    return () => {
      systemDark.removeEventListener("change", apply)
    }
  }, [theme])

  return [theme, setTheme] as const
}
