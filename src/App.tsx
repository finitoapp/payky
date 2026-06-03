import { RouterProvider } from "@tanstack/react-router"
import { createStore, Provider } from "jotai"
import { Suspense } from "react"
import { AppBackgroundJobs } from "@/components/app-background-jobs.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { TranslationProvider } from "@/i18n/use-translation.ts"
import { router } from "@/router.tsx"

const jotaiStore = createStore()

export function App() {
  return (
    <ThemeProvider defaultTheme="system" disableTransitionOnChange>
      <TranslationProvider>
        <Provider store={jotaiStore}>
          <Suspense fallback={null}>
            <AppBackgroundJobs />
          </Suspense>
          <RouterProvider router={router} />
        </Provider>
      </TranslationProvider>
    </ThemeProvider>
  )
}

export default App
