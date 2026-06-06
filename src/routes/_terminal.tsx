import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router"

import { PhoneViewport } from "@/components/skeleton.tsx"
import { cn } from "@/lib/utils.ts"

export const Route = createFileRoute("/_terminal")({
  component: TerminalLayout,
})

function TerminalLayout() {
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
