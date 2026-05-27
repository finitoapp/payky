import { createEvoluBinding } from "@evolu/react"
import type { PropsWithChildren } from "react"

import { ThemeProvider } from "@/components/theme-provider.tsx"
import { AppSchema, type Evolu } from "@/evolu/schema.ts"

export const {
  EvoluContext,
  useEvolu,
  useQuery,
  useQueries,
  useQuerySubscription,
  useOwner,
} = createEvoluBinding(AppSchema)

interface AppProvidersProps extends PropsWithChildren {
  readonly evolu: Evolu
}

export function AppProviders({ children, evolu }: AppProvidersProps) {
  return (
    <EvoluContext value={evolu}>
      <ThemeProvider>{children}</ThemeProvider>
    </EvoluContext>
  )
}
