import { sqliteTrue } from "@evolu/common"
import {
  createDeviceQuery,
  deviceSettingsId,
} from "@payky/core/evolu/device-client"
import { useEffect } from "react"
import {
  disableErrorReporting,
  enableErrorReporting,
} from "../../core/error-reporting.ts"
import { useDeviceEvoluQuery } from "../../hooks/use-evolu-query.ts"

const errorReportingQuery = createDeviceQuery((db) =>
  db
    .selectFrom("deviceSettings")
    .select(["id", "errorReportingEnabled"])
    .where("id", "=", deviceSettingsId)
)

/** Starts and stops error reporting with the device setting; the twin of web's `SentryController`. */
export function SentryController() {
  const enabled =
    useDeviceEvoluQuery(errorReportingQuery).data[0]?.errorReportingEnabled ===
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
