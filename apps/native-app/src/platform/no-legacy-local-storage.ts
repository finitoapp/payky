import type { LocalStorageDep } from "@payky/core/deps"

/**
 * The `localStorage` contract of the device migrations, for a native install.
 * A native sandbox has no legacy browser data, so a read finds nothing and a
 * remove has nothing to remove. Only for migrations: never a settings store.
 */
export const noLegacyLocalStorage: LocalStorageDep["localStorage"] = {
  getItem: () => null,
  removeItem: () => {},
}
