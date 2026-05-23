import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_terminal/settings/about")({
  component: Outlet,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})
