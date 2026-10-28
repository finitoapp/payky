import { rmSync } from "node:fs"
import {
  type CreateSqliteDriverDep,
  type CreateWebSocket,
  constVoid,
  createConsole,
  createConsoleStoreOutput,
  createMessagePort,
  createPreparedStatementsCache,
  createRun,
  createSharedWorker,
  createSqlite,
  createWorker,
  Name,
  ok,
  type SqliteRow,
  testCreateBroadcastChannel,
  testCreateLockManager,
  testCreateMessageChannel,
  testCreateWebSocket,
} from "@evolu/common"
import {
  createEvoluDeps,
  type DbWorkerInit,
  type DevicePersistence,
  initSharedWorker,
  type SharedWorkerInput,
  type SharedWorkerOutput,
  startDbWorker,
} from "@evolu/common/local-first"
import BetterSQLite, { type Statement } from "better-sqlite3"
import { createTestAppEvolu } from "../evolu/client.ts"

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
        constVoid
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
      iterate: (query, onRow) => {
        // A statement of its own, as @evolu/nodejs does: onRow may run
        // queries that would otherwise reuse the cached one while it is busy.
        for (const row of db.prepare(query.sql).iterate(query.parameters)) {
          if (!onRow(row as SqliteRow)) break
        }
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

export const setupRunWithEvoluDeps = async (
  mode: "memory" | string,
  {
    createWebSocket = testCreateWebSocket({ throwOnCreate: true }),
  }: {
    /** Refuses every socket unless a test syncs through a relay of its own. */
    readonly createWebSocket?: CreateWebSocket
  } = {}
) => {
  await using disposer = new AsyncDisposableStack()

  const consoleStoreOutput = createConsoleStoreOutput()
  const console = createConsole({ level: "warn" })
  // One for both sides, like `navigator.locks` in a browser: a DbWorker stops
  // once it can take the lock its shared worker holds, so on a lock manager
  // of its own it would stop at once.
  const lockManager = testCreateLockManager()

  const run = disposer.use(
    createRun({
      console,
      consoleStoreOutputEntry: consoleStoreOutput.entry,
      createBroadcastChannel: testCreateBroadcastChannel,
      createMessageChannel: testCreateMessageChannel,
      createMessagePort: createMessagePort,
      createWebSocket,
      lockManager,
      // What the shared worker may promise about stored databases: a file
      // persists, memory does not.
      getDevicePersistence: () =>
        Promise.resolve<DevicePersistence>(
          mode === "memory" ? "NotPersisted" : "Persisted"
        ),
    })
  )

  const driver = await run.ok(
    createSqliteDep(mode).createSqliteDriver(Name.orThrow("test"))
  )

  const workerRun = disposer.use(
    createRun({
      console,
      consoleStoreOutputEntry: consoleStoreOutput.entry,
      createBroadcastChannel: testCreateBroadcastChannel,
      createMessagePort,
      lockManager,
      createSqliteDriver: () => () => ok(driver),
    })
  )

  const createDbWorker = () =>
    createWorker<DbWorkerInit>((self) => {
      workerRun(startDbWorker(self))
    })

  // Keep the SharedWorker's resources, so they are disposed before `run`
  // and `workerRun`. Left to run disposal, its tenants would be torn down
  // after their own runs were already disposed.
  const sharedWorkerInit = Promise.withResolvers<AsyncDisposableStack>()
  const sharedWorker = createSharedWorker<
    SharedWorkerInput,
    SharedWorkerOutput
  >((self) => {
    sharedWorkerInit.resolve(run.ok(initSharedWorker(self)))
  })
  disposer.use(await sharedWorkerInit.promise)

  const sqlite = disposer.use(
    await workerRun.ok(createSqlite(Name.orThrow("test")))
  )
  // createEvoluDeps owns the shared worker and speaks its tab protocol
  // (Waiting/Connected/DbWorkerInit, tab leader election).
  const evoluDeps = disposer.use(
    createEvoluDeps({
      ...run.deps,
      createDbWorker,
      reloadApp: constVoid,
      sharedWorker,
    })
  )
  const runWithEvoluDeps = disposer.use(run.create(evoluDeps))
  const disposables = disposer.move()

  return {
    run: runWithEvoluDeps,
    sqlite,
    [Symbol.asyncDispose]: () => disposables.disposeAsync(),
  } as const
}

/** App Evolu on an explicit Node SQLite file, or `"memory"` for tests. */
export const createNodeEvolu = async (
  mode: "memory" | string,
  options: Parameters<typeof setupRunWithEvoluDeps>[1] = {}
) => {
  await using disposer = new AsyncDisposableStack()

  const { run } = disposer.use(await setupRunWithEvoluDeps(mode, options))

  // The CLI database is owned by the shared Evolu test owner until the CLI
  // gets a real owner identity.
  const evolu = disposer.use(await run.ok(createTestAppEvolu()))

  const disposables = disposer.move()

  return {
    evolu,
    [Symbol.asyncDispose]: () => disposables.disposeAsync(),
  } as const
}
