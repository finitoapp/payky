import { createRootRoute, Outlet } from "@tanstack/react-router"

import { AppErrorBoundary } from "@/components/error-boundary.tsx"

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: AppErrorBoundary,
})

function RootLayout() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <Outlet />
    </div>
  )
}
