import { createFileRoute } from "@tanstack/react-router"

import { TerminalHomePage } from "@/features/terminal-home/terminal-home-page.tsx"

export const Route = createFileRoute("/_terminal/")({
  component: TerminalHomePage,
  staticData: {
    access: "sell",
    // Full width on a large monitor; the keypad mode narrows itself back.
    terminalLayout: { viewportClassName: "px-3 py-6 lg:max-w-none lg:px-6" },
  },
})
