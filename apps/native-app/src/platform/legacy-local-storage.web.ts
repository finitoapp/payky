import type { LocalStorageDep } from "@payky/core/deps"

/**
 * Web's `legacy-local-storage.ts`: the browser's own `localStorage`, so the
 * device migrations find and clear what web-app left there on this origin.
 */
export const legacyLocalStorage: LocalStorageDep["localStorage"] = localStorage
