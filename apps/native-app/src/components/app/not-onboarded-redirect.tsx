import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import { router, usePathname } from "expo-router"
import { useEffect } from "react"
import { isTerminalRoute } from "../../core/route-access.ts"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"

/**
 * Web's `_terminal` layout shows no terminal route to an account that is not
 * onboarded (a new one created from Settings, or one switched to): this sends
 * it home, whose `NotOnboarded` waits out a first sync before onboarding.
 * Mount once, inside a Suspense of its own: it suspends on each account
 * switch.
 */
export function NotOnboardedRedirect() {
  const pathname = usePathname()
  const [settings] = useEvoluQuery(settingsQuery).data
  const leave =
    settings === undefined && pathname !== "/" && isTerminalRoute(pathname)

  useEffect(() => {
    if (leave) router.replace("/")
  }, [leave])

  return null
}
