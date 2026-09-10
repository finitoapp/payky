import { createFileRoute } from "@tanstack/react-router"
import { Suspense } from "react"

import { PhoneViewport } from "@/components/phone-viewport.tsx"
import { RecoveryPage } from "@/features/recovery/recovery-page.tsx"

export const Route = createFileRoute("/recovery")({
  component: RecoveryRoute,
})

function RecoveryRoute() {
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
