import { installBip39Pbkdf2 } from "@payky/core/modules/shared/bip39-seed"
import { pbkdf2Sync } from "react-native-quick-crypto"

// BIP-39 seeds (the Cashu wallet's, the Spark wallet's) on Quick Crypto's
// native PBKDF2: in pure JS each one blocked the JS thread for ~1.6 s.
installBip39Pbkdf2(
  (password, salt, iterations, keyLength) =>
    new Uint8Array(pbkdf2Sync(password, salt, iterations, keyLength, "sha512"))
)
