import { createConsole, createNativeConsoleOutput } from "@evolu/common"
import { createRun, lockManager } from "@evolu/react-native"
import { createEvoluDeps } from "@evolu/react-native/expo-sqlite"

/**
 * The native composition root's app-lifetime run and its one lock authority.
 * Evolu's React Native lock manager is in-memory, which is sound only while
 * the app has a single JS runtime: a headless task or worker would need its
 * own review before it may write.
 */
export const nativeConsole = createConsole({
  level: "debug",
  output: createNativeConsoleOutput(),
})

export const nativeRun = createRun({
  ...createEvoluDeps({ console: nativeConsole }),
  lockManager,
})

/**
 * Runs on the device (Hermes) to prove that the lock authority serializes
 * contenders, `ifAvailable` sees a held lock, and `await using` disposes.
 */
export async function checkLockAuthority(): Promise<void> {
  const events: string[] = []
  let disposed = false
  {
    await using stack = new AsyncDisposableStack()
    stack.defer(() => {
      disposed = true
    })
    await Promise.all([
      lockManager.request("payky-native-check", async () => {
        events.push("first started")
        const contended = await lockManager.request(
          "payky-native-check",
          { ifAvailable: true },
          (lock) => lock
        )
        events.push(contended === null ? "held" : "not held")
        events.push("first finished")
      }),
      lockManager.request("payky-native-check", () => {
        events.push("second started")
      }),
    ])
  }
  const expected = "first started,held,first finished,second started"
  if (events.join() !== expected || !disposed)
    throw new Error(`Lock authority check failed: ${events.join()}`)
}
