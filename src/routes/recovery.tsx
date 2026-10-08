import { createFileRoute, Navigate } from "@tanstack/react-router"
import { Suspense } from "react"

import { PhoneViewport } from "@/components/phone-viewport.tsx"
import { RecoveryPage } from "@/features/recovery/recovery-page.tsx"
import { useIsStation } from "@/hooks/use-account-kind.ts"

export const Route = createFileRoute("/recovery")({
  component: RecoveryRoute,
})

function RecoveryRoute() {
  // A station's recovery phrase is its link, which only the owner hands out.
  if (useIsStation()) return <Navigate to="/" replace />
  return (
    <main className="min-h-svh bg-background text-foreground">
      <PhoneViewport>
        <Suspense fallback={null}>
          <RecoveryPage />
        </Suspense>
      </PhoneViewport>
    </main>
  )
}
