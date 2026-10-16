import * as React from "react"
import { disableErrorReporting, enableErrorReporting } from "@/core/sentry.ts"
import { useErrorReportingEnabled } from "@/hooks/use-error-reporting.ts"

export function SentryController() {
  const errorReportingEnabled = useErrorReportingEnabled()

  React.useEffect(() => {
    if (errorReportingEnabled) {
      enableErrorReporting()
    } else {
      disableErrorReporting()
    }
  }, [errorReportingEnabled])

  return null
}
