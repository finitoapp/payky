import type { EetNativeCrypto } from "@payky/core/integrations/eet/eet-certificate"

/** Web's `eet-crypto.ts`: none, so core's EET helpers use WebCrypto, as web-app does. */
export const eetNativeCrypto: EetNativeCrypto | undefined = undefined
