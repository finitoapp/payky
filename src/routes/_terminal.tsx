import { sqliteTrue } from "@evolu/common"
import {
  createFileRoute,
  Outlet,
  useMatches,
  useNavigate,
} from "@tanstack/react-router"
import { useEffect } from "react"

import { PhoneViewport } from "@/components/skeleton.tsx"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { cn } from "@/lib/utils.ts"

export const Route = createFileRoute("/_terminal")({
  component: TerminalLayout,
})

function TerminalLayout() {
  const navigate = useNavigate()
  const { data } = useEvoluQuery(settingsQuery)
  const [settings] = data
  const terminalLayout = useMatches({
    select: (matches) => {
      for (let index = matches.length - 1; index >= 0; index -= 1) {
        const match = matches[index]
        const layout = match?.staticData.terminalLayout

        if (layout) {
          return layout
        }
      }

      return undefined
    },
  })
  const onboardingCompleted = settings?.onboardingCompleted === sqliteTrue

  useEffect(() => {
    if (!onboardingCompleted) {
      void navigate({ to: "/onboarding", replace: true })
    }
  }, [navigate, onboardingCompleted])

  if (!onboardingCompleted) {
    return null
  }

  return (
    <main
      className={cn(
        "min-h-svh bg-background text-foreground",
        terminalLayout?.mainClassName
      )}
    >
      <PhoneViewport className={terminalLayout?.viewportClassName}>
        <Outlet />
      </PhoneViewport>
    </main>
  )
}
