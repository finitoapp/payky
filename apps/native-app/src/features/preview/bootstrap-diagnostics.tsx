import { useAtomValue } from "jotai"
import { Component, type ReactNode, Suspense } from "react"
import { Text } from "tamagui"
import { deviceLanguageAtom } from "../../atoms/device-evolu.ts"
import { deviceMigrationsAtom } from "../../atoms/device-migrations.ts"

function Rows() {
  const language = useAtomValue(deviceLanguageAtom)
  const deviceReport = useAtomValue(deviceMigrationsAtom)
  return (
    <>
      <Text>Device language: {language ?? "unset"}</Text>
      <Text>
        Device migrations: {deviceReport.migrated} run
        {deviceReport.failed ? ", FAILED" : ", ok"}
      </Text>
    </>
  )
}

class FailureBoundary extends Component<
  { readonly children: ReactNode },
  { readonly error: string | null }
> {
  override state = { error: null as string | null }
  static getDerivedStateFromError(error: unknown) {
    return { error: String(error) }
  }
  override render() {
    return this.state.error === null ? (
      this.props.children
    ) : (
      <Text color="red">Bootstrap failed: {this.state.error}</Text>
    )
  }
}

/** Diagnostic view of the native bootstrap; never shows keys or row data. */
export function BootstrapDiagnostics() {
  return (
    <FailureBoundary>
      <Suspense fallback={<Text>Bootstrapping…</Text>}>
        <Rows />
      </Suspense>
    </FailureBoundary>
  )
}
