import { RouterProvider } from "@tanstack/react-router"
import { createStore, Provider } from "jotai"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { TranslationProvider } from "@/i18n/use-translation.ts"
import { router } from "@/router.tsx"

const jotaiStore = createStore()

export function App() {
  return (
    <ThemeProvider defaultTheme="system" disableTransitionOnChange>
      <TranslationProvider>
        <Provider store={jotaiStore}>
          <RouterProvider router={router} />
        </Provider>
      </TranslationProvider>
    </ThemeProvider>
  )
}

export default App
