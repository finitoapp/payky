import { QueryClientProvider } from "@tanstack/react-query"
import { CatchBoundary, RouterProvider } from "@tanstack/react-router"
import { createStore, Provider } from "jotai"
import { LoaderCircleIcon } from "lucide-react"
import { Suspense, useEffect } from "react"
import { AppBackgroundJobs } from "@/components/app-background-jobs.tsx"
import { AppLoaderCleanup } from "@/components/app-loader-cleanup.tsx"
import { ConfirmDialogHost } from "@/components/confirm-dialog-host.tsx"
import { E2eTestBridge } from "@/components/e2e-test-bridge.tsx"
import { AppErrorBoundary } from "@/components/error-boundary.tsx"
import { NativeBackButtonHandler } from "@/components/native-back-button-handler.tsx"
import { PwaUpdateToast } from "@/components/pwa-update-toast.tsx"
import { SentryController } from "@/components/sentry-controller.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { Toaster } from "@/components/ui/sonner.tsx"
import { queryClient } from "@/core/query-client.ts"
import { captureReportedError } from "@/core/sentry.ts"
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

/**
 * Renders nothing: a broken app Evolu client already shows up on the screens
 * that need it, and the shell has to keep working without background sync.
 * Still reported, so it cannot vanish silently.
 */
function AppEvoluConsumersFailed({ error }: { readonly error: unknown }) {
  useEffect(() => {
    captureReportedError(error)
  }, [error])

  return null
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Provider store={jotaiStore}>
        {/*
         * Sits above the Suspense boundary, so it also catches what the
         * components below suspend on: device Evolu (`ThemeProvider`), the
         * active account and app Evolu (`AppBackgroundJobs`). Those reads
         * happen outside the router, so the root route's own
         * `errorComponent` never saw them — a failing one threw with no
         * boundary above it, React unmounted the root, and the app was left
         * showing index.html's boot spinner forever (or a blank page, once
         * the spinner had already been removed).
         */}
        <CatchBoundary
          getResetKey={() => "app"}
          errorComponent={AppErrorBoundary}
        >
          <Suspense fallback={<AppLoadingFallback />}>
            <AppLoaderCleanup />
            <ThemeProvider disableTransitionOnChange>
              <SentryController />
              <NativeBackButtonHandler />
              {/*
               * Isolated, because both read the active account's app Evolu
               * client: one that throws would otherwise take the shell
               * down with it, and one that never finishes opening would
               * suspend the shell forever — in both cases including
               * `/recovery`, the one screen that can still switch
               * accounts, since it needs only the device database. Both of
               * these are best-effort; losing them costs sync, not the UI.
               */}
              <CatchBoundary
                getResetKey={() => "app-evolu-consumers"}
                errorComponent={AppEvoluConsumersFailed}
              >
                <Suspense fallback={null}>
                  <AppBackgroundJobs />
                  <E2eTestBridge />
                </Suspense>
              </CatchBoundary>
              <RouterProvider router={router} />
              <PwaUpdateToast />
              <Toaster />
              <ConfirmDialogHost />
            </ThemeProvider>
          </Suspense>
        </CatchBoundary>
      </Provider>
    </QueryClientProvider>
  )
}
