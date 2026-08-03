import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { createStore, Provider } from "jotai"
import { LoaderCircleIcon } from "lucide-react"
import { Suspense } from "react"
import { AppBackgroundJobs } from "@/components/app-background-jobs.tsx"
import { AppLoaderCleanup } from "@/components/app-loader-cleanup.tsx"
import { NativeBackButtonHandler } from "@/components/native-back-button-handler.tsx"
import { PwaUpdateToast } from "@/components/pwa-update-toast.tsx"
import { SentryController } from "@/components/sentry-controller.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { Toaster } from "@/components/ui/sonner.tsx"
import { queryClient } from "@/core/query-client.ts"
import { router } from "@/router.tsx"

const jotaiStore = createStore()

/**
 * Renders before `ThemeProvider` has mounted (it's suspended in the same
 * boundary). The `dark` class it would normally apply is already set by
 * index.html's bootstrap script (synchronously, before first paint, from the
 * cached theme hint), so these theme-aware classes resolve correctly here too.
 */
function AppLoadingFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <LoaderCircleIcon
        className="size-8 animate-spin text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Provider store={jotaiStore}>
        <Suspense fallback={<AppLoadingFallback />}>
          <AppLoaderCleanup />
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
