import { createReactNativeCrypto } from "@finitoapp/eet-client/react-native"
import QuickCrypto from "react-native-quick-crypto"

/**
 * EET's crypto on this device: eet-client's React Native backend over Quick
 * Crypto, passed explicitly to core's EET helpers (`EetNativeCrypto`), so
 * PKCS#12, request signing and the response check do not go through the
 * global `crypto.subtle` polyfill. Quick Crypto's `install()` is not called,
 * as eet-client asks.
 */
export const eetNativeCrypto = createReactNativeCrypto(QuickCrypto)
