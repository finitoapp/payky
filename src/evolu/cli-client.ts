import {
  type CreateSqliteDriverDep,
  createConsole,
  createConsoleStoreOutput,
  createMessageChannel,
  createMessagePort,
  createSharedWorker,
  createSqlite,
  createWorker,
  lazyVoid,
  Name,
  ok,
  testCreateLockManager,
  testCreateWebSocket,
} from "@evolu/common"
import {
  type DbWorkerInit,
  initSharedWorker,
  type SharedWorkerInput,
  type SharedWorkerOutput,
  startDbWorker,
} from "@evolu/common/local-first"
import {
  createBetterSqliteDriver,
  createBroadcastChannel,
  createRun,
} from "@evolu/nodejs"
import { createAppEvolu } from "@/evolu/client.ts"

const createSqliteDep: CreateSqliteDriverDep = {
  createSqliteDriver: (name) =>
    createBetterSqliteDriver(name, { mode: "test.db" }),
}

export const setupRunWithEvoluDeps = async () => {
  await using disposer = new AsyncDisposableStack()

  const consoleStoreOutput = createConsoleStoreOutput()

  const run = disposer.use(
    createRun({
      console: createConsole({ level: "debug" }),
      consoleStoreOutputEntry: consoleStoreOutput.entry,
      createBroadcastChannel,
      createMessageChannel,
      createMessagePort: createMessagePort,
      createWebSocket: testCreateWebSocket({ throwOnCreate: true }),
      lockManager: testCreateLockManager(),
    })
  )

  const driver = await run.orThrow(
    createSqliteDep.createSqliteDriver(Name.orThrow("test"))
  )

  const workerRun = disposer.use(
    createRun({
      consoleStoreOutputEntry: consoleStoreOutput.entry,
      createBroadcastChannel,
      createMessagePort,
      lockManager: testCreateLockManager(),
      createSqliteDriver: () => () => ok(driver),
    })
  )

  const createDbWorker = () =>
    createWorker<DbWorkerInit>((self) => {
      workerRun(startDbWorker(self))
    })

  const sharedWorker = disposer.use(
    createSharedWorker<SharedWorkerInput, SharedWorkerOutput>((self) => {
      run(initSharedWorker(self))
    })
  )
  sharedWorker.port.onMessage = (message) => {
    createDbWorker().postMessage(message, [message.port])
  }
  sharedWorker.port.postMessage({
    type: "AnnounceTabLeader",
    consoleLevel: "debug",
  })

  const sqlite = disposer.use(
    await workerRun.orThrow(createSqlite(Name.orThrow("test")))
  )
  const runWithEvoluDeps = disposer.use(
    run.create({
      ...run.deps,
      createDbWorker,
      reloadApp: lazyVoid,
      sharedWorker,
    })
  )
  const disposables = disposer.move()

  return {
    run: runWithEvoluDeps,
    sqlite,
    [Symbol.asyncDispose]: () => disposables.disposeAsync(),
  } as const
}

export const createEvoluCli = async () => {
  await using disposer = new AsyncDisposableStack()

  const { run } = disposer.use(await setupRunWithEvoluDeps())

  const evolu = await run.orThrow(createAppEvolu())

  const disposables = disposer.move()

  return {
    evolu,
    [Symbol.asyncDispose]: () => disposables.disposeAsync(),
  } as const
}
