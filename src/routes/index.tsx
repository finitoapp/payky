import { createFileRoute } from "@tanstack/react-router"

import { HomePage } from "@/pages.tsx"

export const Route = createFileRoute("/")({
  component: HomePage,
})
