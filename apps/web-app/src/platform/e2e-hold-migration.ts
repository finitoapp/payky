import { ok } from "@evolu/common"
import type { AppMigration } from "@payky/core/migrations/migrations"

declare global {
  interface Window {
    /**
     * Set by an e2e spec through `page.addInitScript` before the load it
     * should affect — see `e2e/support/migrations.ts`.
     */
    __e2eHoldMigrations?: boolean
    __e2eReleaseMigrations?: () => void
  }
}

/**
 * A migration that exists only to be watched.
 *
 * The real ones are a handful of local Evolu writes and finish in
 * milliseconds, which leaves the popup's running state impossible to
 * screenshot with any reliability — and there is nothing external to slow
 * down, since a migration touches no network. So the registry carries one
 * entry whose work *is* the waiting: `hasWork` is false unless an e2e spec
 * armed the flag, and `run` blocks until that spec releases it.
 *
 * Inert twice over in anything shipped. `import.meta.env.DEV` is false in
 * every `vite build` output and `__E2E_TEST_BUILD__` is true only in the
 * build `bun run test:e2e:preview` makes, so `hasWork` always answers false,
 * the entry is never pending, and `run` is never reached — the same gate, for
 * the same reason, as `E2eTestBridge`'s.
 */
export const e2eHoldMigration: AppMigration = {
  name: "e2e-hold",
  hasWork: async () =>
    ok(
      (import.meta.env.DEV || __E2E_TEST_BUILD__) &&
        typeof window !== "undefined" &&
        window.__e2eHoldMigrations === true
    ),
  run: async () => {
    await new Promise<void>((resolve) => {
      window.__e2eReleaseMigrations = resolve
    })

    return ok(undefined)
  },
}
