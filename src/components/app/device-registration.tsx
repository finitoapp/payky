import { useAtomValue } from "jotai"
import { useEffect } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { applyPinUnblock } from "@/core/modules/access/access-actions.ts"
import { registerDevice } from "@/core/modules/device/device-actions.ts"
import { deviceByIdQuery } from "@/core/modules/device/device-queries.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"

/**
 * Keeps this device's row in the active account's app database
 * (access/0004): registered once per app database opened, and an unblock
 * another device writes to it applied here (access/0006).
 */
export function DeviceRegistration() {
  const appRun = useAppRun()
  const { id: accountId, device } = useAtomValue(accountAtom)
  const { data } = useEvoluQuery(deviceByIdQuery(device.id))
  const token = data[0]?.pinUnblockToken ?? null

  useEffect(() => {
    void (async () => {
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
    })()
  }, [appRun, device])

  useEffect(() => {
    if (token === null) return
    void (async () => {
      await using run = appRun()
      await run.ok(applyPinUnblock({ accountId, deviceId: device.id, token }))
    })()
  }, [accountId, appRun, device.id, token])

  return null
}
