import { ok } from "@evolu/common"
import type { AppMigration } from "@payky/core/migrations/migrations"
import { nativeEnv } from "../core/native-env.ts"
import { kvStore } from "../platform/kv-store"

/**
 * Persisted rather than in memory: the flow arms the hold, then restarts the
 * app (web reloads the page), and the start after that is the one held.
 */
const holdKey = "payky:e2e-hold-migrations"

let release: (() => void) | undefined
let released = false

/** Holds the migrations of every later start, until released. */
export const holdE2eMigrations = (): void => {
  kvStore.setItemSync(holdKey, "1")
}

/**
 * Lets a held run finish and disarms the hold for later starts. On web the
 * link that calls this reloads the page, so it may run before the held
 * migration starts waiting; `released` covers that.
 */
export const releaseE2eMigrations = (): void => {
  kvStore.removeItemSync(holdKey)
  released = true
  release?.()
}

/**
 * Web's `e2e-hold-migration.ts`: a migration that exists only to be watched.
 *
 * The real ones are a handful of local Evolu writes and finish in
 * milliseconds, which leaves the popup's running state impossible to catch —
 * and there is nothing external to slow down, since a migration touches no
 * network. So the registry carries one entry whose work *is* the waiting:
 * `hasWork` is false unless a flow armed the hold, and `run` blocks until it
 * is released. Inert outside an e2e build (`EXPO_PUBLIC_PAYKY_E2E`).
 */
export const e2eHoldMigration: AppMigration = {
  name: "e2e-hold",
  hasWork: async () =>
    ok(nativeEnv.EXPO_PUBLIC_PAYKY_E2E && kvStore.getItemSync(holdKey) === "1"),
  run: async () => {
    await new Promise<void>((resolve) => {
      if (released) resolve()
      else release = resolve
    })
    return ok(undefined)
  },
}
