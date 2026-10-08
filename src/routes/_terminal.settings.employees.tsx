import { createFileRoute } from "@tanstack/react-router"

import { EmployeesSettingsPage } from "@/features/settings/employees/employees-settings-page.tsx"

export const Route = createFileRoute("/_terminal/settings/employees")({
  component: EmployeesSettingsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})
