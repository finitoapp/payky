import { createFileRoute } from "@tanstack/react-router"

import { WithdrawPage } from "@/features/withdraw/withdraw-page.tsx"

export const Route = createFileRoute("/_terminal/settings/withdraw")({
  component: WithdrawPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})
