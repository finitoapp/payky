import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { AccountId } from "@/core/evolu/device-client.ts"
import { RestoreSyncPage } from "@/features/account/restore-sync-page.tsx"

// Every field falls back instead of throwing: a `validateSearch` throw on a
// stale link would escape to the global error boundary, and a missing
// `previous` only means nothing gets cleaned up.
const RestoreAccountSearchSchema = z.object({
  source: z.enum(["onboarding", "settings"]).catch("settings"),
  previous: AccountId.optional().catch(undefined),
  created: z.boolean().catch(false),
})

export const Route = createFileRoute("/restore-account")({
  component: RestoreAccountRoute,
  validateSearch: (search) => RestoreAccountSearchSchema.parse(search),
})

function RestoreAccountRoute() {
  return <RestoreSyncPage {...Route.useSearch()} />
}
