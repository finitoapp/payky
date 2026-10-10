import { setupRunWithEvoluDeps } from "@/core/cli/cli-evolu.ts"
import { createDeviceEvolu } from "@/core/evolu/device-client.ts"

/** A device database in memory, disposed with the returned object. */
export const createTestDeviceEvolu = async () => {
  await using disposer = new AsyncDisposableStack()
  const { run } = disposer.use(await setupRunWithEvoluDeps("memory"))
  const deviceEvolu = disposer.use(await run.ok(createDeviceEvolu))
  const disposables = disposer.move()

  return {
    deviceEvolu,
    [Symbol.asyncDispose]: () => disposables.disposeAsync(),
  } as const
}
