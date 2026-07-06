import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { createStore, Provider } from "jotai"
import { Suspense } from "react"
import { AppBackgroundJobs } from "@/components/app-background-jobs.tsx"
import { NativeBackButtonHandler } from "@/components/native-back-button-handler.tsx"
import { PwaUpdateToast } from "@/components/pwa-update-toast.tsx"
import { SentryController } from "@/components/sentry-controller.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { Toaster } from "@/components/ui/sonner.tsx"
import { queryClient } from "@/core/query-client.ts"
import { router } from "@/router.tsx"

const jotaiStore = createStore()

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Provider store={jotaiStore}>
        <Suspense fallback={null}>
          <ThemeProvider disableTransitionOnChange>
            <SentryController />
            <NativeBackButtonHandler />
            <AppBackgroundJobs />
            <RouterProvider router={router} />
            <PwaUpdateToast />
            <Toaster />
          </ThemeProvider>
        </Suspense>
      </Provider>
    </QueryClientProvider>
  )
}

export default App
