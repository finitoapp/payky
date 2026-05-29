import { rmSync } from "node:fs"
import {
  type CreateSqliteDriverDep,
  createConsole,
  createConsoleStoreOutput,
  createMessageChannel,
  createMessagePort,
  createPreparedStatementsCache,
  createSharedWorker,
  createSqlite,
  createWorker,
  lazyVoid,
  Name,
  ok,
  type SqliteRow,
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
import { createBroadcastChannel, createRun } from "@evolu/nodejs"
import BetterSQLite, { type Statement } from "better-sqlite3"
import { cliEnv } from "@/core/cli/cli-env.ts"
import { createAppEvolu } from "@/core/evolu/client.ts"

const createSqliteDep = (
  filename: "memory" | string
): CreateSqliteDriverDep => ({
  createSqliteDriver: (_name, options) => () => {
    const sqliteFilename =
      filename === "memory" || options?.mode === "memory"
        ? ":memory:"
        : filename
    const filenamesToDelete =
      sqliteFilename === ":memory:"
        ? []
        : [
            sqliteFilename,
            `${sqliteFilename}-shm`,
            `${sqliteFilename}-wal`,
            `${sqliteFilename}-journal`,
          ]

    using disposer = new DisposableStack()
    const db = disposer.adopt(new BetterSQLite(sqliteFilename), (db) => {
      db.close()
    })
    const cache = disposer.use(
      createPreparedStatementsCache<Statement>(
        (sql) => db.prepare(sql),
        lazyVoid
      )
    )
    const disposables = disposer.move()

    return ok({
      exec: (query) => {
        const prepared = cache.get(query, true)

        if (prepared.reader) {
          const rows = prepared.all(query.parameters) as Array<SqliteRow>
          return { rows, changes: 0 }
        }

        const changes = prepared.run(query.parameters).changes
        return { rows: [], changes }
      },
      export: () => {
        const file = db.serialize()
        const { buffer } = file

        if (buffer instanceof ArrayBuffer) {
          return new Uint8Array(buffer, file.byteOffset, file.byteLength)
        }

        return new Uint8Array(file)
      },
      deleteDatabase: () => {
        using deleteDisposer = new DisposableStack()
        for (const filename of filenamesToDelete) {
          deleteDisposer.defer(() => {
            rmSync(filename, { force: true })
          })
        }
        deleteDisposer.use(disposables)
      },
      [Symbol.dispose]: () => {
        disposables.dispose()
      },
    })
  },
})

export const setupRunWithEvoluDeps = async (mode: "memory" | string) => {
  await using disposer = new AsyncDisposableStack()

  const consoleStoreOutput = createConsoleStoreOutput()

  const run = disposer.use(
    createRun({
      console: createConsole({ level: "log" }),
      consoleStoreOutputEntry: consoleStoreOutput.entry,
      createBroadcastChannel,
      createMessageChannel,
      createMessagePort: createMessagePort,
      createWebSocket: testCreateWebSocket({ throwOnCreate: true }),
      lockManager: testCreateLockManager(),
    })
  )

  const driver = await run.orThrow(
    createSqliteDep(mode).createSqliteDriver(Name.orThrow("test"))
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

export const createEvolu = async (mode: "memory" | string) => {
  await using disposer = new AsyncDisposableStack()

  const { run } = disposer.use(await setupRunWithEvoluDeps(mode))

  const evolu = await run.orThrow(createAppEvolu())

  const disposables = disposer.move()

  return {
    evolu,
    [Symbol.asyncDispose]: () => disposables.disposeAsync(),
  } as const
}

export const createEvoluCli = (mode = cliEnv.PAYKY_SQLITE_PATH) =>
  createEvolu(mode)

export const createEvoluTest = () => createEvolu("memory")
