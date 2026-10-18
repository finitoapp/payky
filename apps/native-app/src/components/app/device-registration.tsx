import { lockManager } from "@evolu/react-native"
import { createDateDep } from "@payky/core/deps"
import { applyPinUnblock } from "@payky/core/modules/access/access-actions"
import { registerDevice } from "@payky/core/modules/device/device-actions"
import { deviceByIdQuery } from "@payky/core/modules/device/device-queries"
import { useAtomValue } from "jotai"
import { useEffect } from "react"
import { accountAtom } from "../../atoms/account.ts"
import { deviceEvoluAtom } from "../../atoms/device-evolu.ts"
import { evoluAtom } from "../../atoms/evolu.ts"
import { nativeConsole, nativeRun } from "../../core/native-runtime.ts"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"

/**
 * Keeps this device's row in the active account's app database
 * (access/0004): registered once per app database opened, and an unblock
 * another device writes to it applied here (access/0006). The native twin of
 * web's `DeviceRegistration`.
 */
export function DeviceRegistration() {
  const evolu = useAtomValue(evoluAtom)
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const { id: accountId, device } = useAtomValue(accountAtom)
  const { data } = useEvoluQuery(deviceByIdQuery(device.id))
  const token = data[0]?.pinUnblockToken ?? null

  // Nothing on screen waits for these, so a failure is logged, as on web,
  // rather than left to escape as an unhandled rejection.
  useEffect(() => {
    void (async () => {
      try {
        await using run = nativeRun.create({
          evolu,
          evoluOwner: evolu.appOwner,
        })
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
        nativeConsole.error("Device registration failed.", error)
      }
    })()
  }, [evolu, device])

  useEffect(() => {
    if (token === null) return
    void (async () => {
      try {
        await using run = nativeRun.create({
          evolu,
          evoluOwner: evolu.appOwner,
          deviceEvolu,
          lockManager,
          ...createDateDep(),
        })
        await run.ok(applyPinUnblock({ accountId, deviceId: device.id, token }))
      } catch (error) {
        nativeConsole.error("Applying the PIN unblock failed.", error)
      }
    })()
  }, [accountId, deviceEvolu, evolu, device.id, token])

  return null
}
