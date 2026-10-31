import { createRun, type Name, Port } from "@evolu/common"
import {
  createBetterSqliteDriver,
  createRelay,
  createRelayDeps,
} from "@evolu/nodejs"

/**
 * An Evolu relay on a free local port, its storage in memory, for tests that
 * sync two databases for real. Pass `createWebSocket` from `@evolu/common` to
 * the Evolu instances that should reach it.
 */
export const createTestRelay = async () => {
  await using disposer = new AsyncDisposableStack()
  const run = disposer.use(
    createRun({
      ...createRelayDeps(),
      // The relay would otherwise write `<name>.db` to the working directory.
      createSqliteDriver: (name: Name) =>
        createBetterSqliteDriver(name, { mode: "memory" }),
    })
  )
  const relay = disposer.use(
    await run.ok(
      createRelay({ port: Port.orThrow(0), isOwnerWithinQuota: () => true })
    )
  )
  const disposables = disposer.move()
  return {
    url: `ws://127.0.0.1:${relay.port}`,
    [Symbol.asyncDispose]: () => disposables.disposeAsync(),
  } as const
}
