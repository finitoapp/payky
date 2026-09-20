import { createFileRoute } from "@tanstack/react-router"

import { ProfileSettingsPage } from "@/features/settings/my-account/profile-settings-page.tsx"

export const Route = createFileRoute("/_terminal/settings/profile")({
  component: ProfileSettingsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})
