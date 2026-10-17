import { useAtomValue } from "jotai"
import { Component, type ReactNode, Suspense } from "react"
import { Text } from "tamagui"
import { accountAtom } from "../../atoms/account.ts"
import { appMigrationsAtom } from "../../atoms/app-migrations.ts"
import { deviceLanguageAtom } from "../../atoms/device-evolu.ts"
import { deviceMigrationsAtom } from "../../atoms/device-migrations.ts"
import { evoluAtom } from "../../atoms/evolu.ts"
import { LiveQueryDemo } from "./live-query-demo.tsx"

function Ready({ children }: { readonly children: ReactNode }) {
  const report = useAtomValue(appMigrationsAtom)
  return report.failed ? (
    <Text color="red">
      Data migration failed. Restart the app; see the log for details.
    </Text>
  ) : (
    <>
      <Text>App migrations: {report.migrated} run, ready</Text>
      {children}
    </>
  )
}

function Rows() {
  const language = useAtomValue(deviceLanguageAtom)
  const deviceReport = useAtomValue(deviceMigrationsAtom)
  const account = useAtomValue(accountAtom)
  const evolu = useAtomValue(evoluAtom)
  return (
    <>
      <Text>Device language: {language ?? "unset"}</Text>
      <Text>
        Device migrations: {deviceReport.migrated} run
        {deviceReport.failed ? ", FAILED" : ", ok"}
      </Text>
      <Text>Diagnostic account id: {account.id}</Text>
      <Text>App owner id: {evolu.appOwner.id}</Text>
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
        <Ready>
          <Rows />
          <LiveQueryDemo />
        </Ready>
      </Suspense>
    </FailureBoundary>
  )
}
