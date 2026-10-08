import { createFileRoute } from "@tanstack/react-router"

import { AccountTransferSourcePage } from "@/features/account/account-transfer-source-page.tsx"

export const Route = createFileRoute("/_terminal/settings/accounts/transfer")({
  component: AccountTransferSourcePage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})
