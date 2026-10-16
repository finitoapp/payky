import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"

import type { jotaiStore } from "@/atoms/store.ts"

import { AppErrorBoundary } from "@/components/app/error-boundary.tsx"

export interface RouterContext {
  readonly jotaiStore: typeof jotaiStore
}

export const Route = createRootRouteWithContext<RouterContext>()({
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
