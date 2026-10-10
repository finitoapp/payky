import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { RestoreSyncPage } from "@/features/onboarding/restore-sync-page.tsx"

// Falls back instead of throwing: a `validateSearch` throw on a stale link
// would escape to the global error boundary. Only `source` lives here; which
// account to remove or select never comes from the URL (account/0005).
const RestoreAccountSearchSchema = z.object({
  source: z.enum(["onboarding", "settings"]).catch("settings"),
})

export const Route = createFileRoute("/restore-account")({
  component: RestoreAccountRoute,
  validateSearch: (search) => RestoreAccountSearchSchema.parse(search),
})

function RestoreAccountRoute() {
  return <RestoreSyncPage {...Route.useSearch()} />
}
