import { createFileRoute } from "@tanstack/react-router"

import { NewTablePage } from "@/features/settings/tables/table-form-page.tsx"

export const Route = createFileRoute("/_terminal/settings/tables/new")({
  component: NewTablePage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})
