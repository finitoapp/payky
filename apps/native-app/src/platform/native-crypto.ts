import { installBip39Pbkdf2 } from "@payky/core/modules/shared/bip39-seed"
import { installHmacSha512 } from "@payky/core/modules/shared/hmac-sha512"
import { createHmac, pbkdf2Sync } from "react-native-quick-crypto"

// Payky's key derivations on Quick Crypto rather than in pure JS on Hermes:
// each BIP-39 seed (the Cashu wallet's, the Spark wallet's) blocked the JS
// thread for ~1.6 s, and the HMAC-SHA512 behind the account ids, which the
// device migration check derives for every account at each start, cost a few
// milliseconds per call.
installBip39Pbkdf2(
  (password, salt, iterations, keyLength) =>
    new Uint8Array(pbkdf2Sync(password, salt, iterations, keyLength, "sha512"))
)
installHmacSha512(
  (key, data) => new Uint8Array(createHmac("sha512", key).update(data).digest())
)
