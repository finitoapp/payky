import { createFileRoute } from "@tanstack/react-router"

import { NostrRelaysSettingsPage } from "@/features/settings/nostr-relays/nostr-relays-settings-page.tsx"

export const Route = createFileRoute("/_terminal/settings/nostr-relays")({
  component: NostrRelaysSettingsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})
