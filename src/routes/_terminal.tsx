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
  // The appSettings row's existence marks the account as onboarded.
  // TODO: A missing row can mean either "fresh account" or "restored account
  // whose first sync has not finished yet". These cannot be told apart yet, so
  // a restored account may briefly land in onboarding (and completing it could
  // overwrite synced settings via last-write-wins). The next Evolu version
  // exposes a sync-state API — use it here to wait for the initial sync before
  // deciding.
  const onboarded = settings !== undefined

  useEffect(() => {
    if (!onboarded) {
      void navigate({ to: "/onboarding", replace: true })
    }
  }, [navigate, onboarded])

  if (!onboarded) {
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
