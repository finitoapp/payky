import { usePathname } from "expo-router"
import { type ReactNode, Suspense } from "react"
import { Text, View } from "tamagui"
import { requiredPermission } from "../core/route-access.ts"
import { useAccess } from "../core/use-access.ts"
import { useTranslation } from "../hooks/use-translation.ts"

function Gate({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname()
  const access = useAccess()
  const { t } = useTranslation()
  const permission = requiredPermission(pathname)

  if (permission === null || access.effective.has(permission)) return children
  // The PIN screen is U05; until then a gated route shows no content.
  return (
    <View flex={1} items="center" justify="center">
      <Text>{t("access.pin.title")}</Text>
    </View>
  )
}

/** Re-resolves the current path on every render: deep links, back, restores. */
export function AccessGate({ children }: { readonly children: ReactNode }) {
  return (
    <Suspense fallback={<Text>Bootstrapping…</Text>}>
      <Gate>{children}</Gate>
    </Suspense>
  )
}
