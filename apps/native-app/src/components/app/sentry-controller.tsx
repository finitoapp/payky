import { sqliteTrue } from "@evolu/common"
import { useEffect } from "react"
import { deviceSettingsQuery } from "../../atoms/device-evolu.ts"
import {
  disableErrorReporting,
  enableErrorReporting,
} from "../../core/error-reporting.ts"
import { useDeviceEvoluQuery } from "../../hooks/use-evolu-query.ts"

/** Starts and stops error reporting with the device setting; the twin of web's `SentryController`. */
export function SentryController() {
  const enabled =
    useDeviceEvoluQuery(deviceSettingsQuery).data[0]?.errorReportingEnabled ===
    sqliteTrue

  useEffect(() => {
    if (enabled) {
      enableErrorReporting()
    } else {
      disableErrorReporting()
    }
  }, [enabled])

  return null
}
