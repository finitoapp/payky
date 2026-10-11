import { createFileRoute } from "@tanstack/react-router"

import { StatsPage } from "@/features/stats/stats-page.tsx"
import { StatsSearchSchema } from "@/features/stats/stats-search.ts"

export const Route = createFileRoute("/_terminal/stats")({
  component: StatsRoute,
  validateSearch: (search) => StatsSearchSchema.parse(search),
  staticData: {
    access: "stats",
    // `overflow-x-clip` instead of the default `overflow-hidden`, which would
    // make the viewport a scroll container and stop the period bar sticking.
    terminalLayout: {
      viewportClassName: "px-3 py-6 overflow-x-clip overflow-y-visible",
    },
  },
})

function StatsRoute() {
  const navigate = Route.useNavigate()

  return (
    <StatsPage
      search={Route.useSearch()}
      // `replace`: switching the period is not a step Back should rewind.
      onSearchChange={(search) => {
        void navigate({ search, replace: true })
      }}
    />
  )
}
