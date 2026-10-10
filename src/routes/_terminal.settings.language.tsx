import { createFileRoute } from "@tanstack/react-router"

import { LanguageSettingsPage } from "@/features/settings/language/language-settings-page.tsx"

export const Route = createFileRoute("/_terminal/settings/language")({
  component: LanguageSettingsPage,
  staticData: {
    access: "free",
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})
