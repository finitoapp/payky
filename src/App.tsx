import { RouterProvider } from "@tanstack/react-router"
import { createStore, Provider } from "jotai"
import { Suspense } from "react"
import { AppBackgroundJobs } from "@/components/app-background-jobs.tsx"
import { PwaUpdateToast } from "@/components/pwa-update-toast.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { Toaster } from "@/components/ui/sonner.tsx"
import { router } from "@/router.tsx"

const jotaiStore = createStore()

export function App() {
  return (
    <Provider store={jotaiStore}>
      <Suspense fallback={null}>
        <ThemeProvider disableTransitionOnChange>
          <AppBackgroundJobs />
          <RouterProvider router={router} />
          <PwaUpdateToast />
          <Toaster />
        </ThemeProvider>
      </Suspense>
    </Provider>
  )
}

export default App
