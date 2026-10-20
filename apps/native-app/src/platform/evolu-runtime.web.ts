import { createEvoluDeps, createRun } from "@evolu/web"

/** Web's `evolu-runtime.ts`: Evolu's OPFS SQLite worker and the browser's locks. */
export const lockManager = navigator.locks

export { createEvoluDeps, createRun }
