import { useAtomValue } from "jotai"
import { useEffect } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { applyPinUnblock } from "@/core/modules/access/access-actions.ts"
import { registerDevice } from "@/core/modules/device/device-actions.ts"
import { deviceByIdQuery } from "@/core/modules/device/device-queries.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"

/**
 * Keeps this device's row in the active account's app database
 * (access/0004): registered once per app database opened, and an unblock
 * another device writes to it applied here (access/0006).
 */
export function DeviceRegistration() {
  const appRun = useAppRun()
  const console = useConsole()
  const { id: accountId, device } = useAtomValue(accountAtom)
  const { data } = useEvoluQuery(deviceByIdQuery(device.id))
  const token = data[0]?.pinUnblockToken ?? null

  // Nothing on screen waits for these, so a failure is logged, as
  // `AppMigrations` does, rather than left to escape as an unhandled rejection.
  useEffect(() => {
    void (async () => {
      try {
        await using run = appRun()
        await run.ok(
          registerDevice({
            id: device.id,
            name: device.name,
            deviceType: device.deviceType,
            browserName: device.browserName,
            osName: device.osName,
          })
        )
      } catch (error) {
        console.error("Device registration failed.", error)
      }
    })()
  }, [appRun, console, device])

  useEffect(() => {
    if (token === null) return
    void (async () => {
      try {
        await using run = appRun()
        await run.ok(applyPinUnblock({ accountId, deviceId: device.id, token }))
      } catch (error) {
        console.error("Applying the PIN unblock failed.", error)
      }
    })()
  }, [accountId, appRun, console, device.id, token])

  return null
}
