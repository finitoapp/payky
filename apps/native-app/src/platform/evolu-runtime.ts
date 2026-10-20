import { createRun, lockManager } from "@evolu/react-native"
import { createEvoluDeps } from "@evolu/react-native/expo-sqlite"

/**
 * The Evolu platform half the composition root picks per platform: expo-sqlite
 * (SQLCipher) and an in-memory lock manager here, `evolu-runtime.web.ts` on web.
 */
export { createEvoluDeps, createRun, lockManager }
