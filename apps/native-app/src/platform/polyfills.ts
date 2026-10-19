import { getRandomValues, randomUUID } from "expo-crypto"
// Only `subtle` is taken: quick-crypto's own `install()` would replace Expo
// Crypto's getRandomValues and the global Buffer. The PIN hash (PBKDF2,
// core's access-utils) needs it; EET gets Quick Crypto explicitly
// (platform/eet-crypto.ts).
import { subtle } from "react-native-quick-crypto"

// Evolu creates query IDs during import, before any route or provider mounts.
Object.defineProperty(globalThis, "crypto", {
  value: Object.assign(globalThis.crypto ?? {}, {
    getRandomValues,
    randomUUID,
    subtle,
  }),
  configurable: true,
  writable: true,
})
