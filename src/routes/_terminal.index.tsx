import { createFileRoute } from "@tanstack/react-router"

import { TerminalHomePage } from "@/features/terminal-home/terminal-home-page.tsx"

export const Route = createFileRoute("/_terminal/")({
  component: TerminalHomePage,
  staticData: {
    access: "sell",
  },
})
