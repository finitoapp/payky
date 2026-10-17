import { getRandomValues, randomUUID } from "expo-crypto"

// Evolu creates query IDs during import, before any route or provider mounts.
Object.defineProperty(globalThis, "crypto", {
  value: Object.assign(globalThis.crypto ?? {}, {
    getRandomValues,
    randomUUID,
  }),
  configurable: true,
  writable: true,
})
