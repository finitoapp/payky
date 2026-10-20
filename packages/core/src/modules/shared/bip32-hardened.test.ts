import { HDKey } from "@scure/bip32"
import { describe, expect, test } from "vitest"

import {
  deriveHardenedPrivateKey,
  parseHardenedPath,
} from "./bip32-hardened.ts"
import {
  cashuWalletSeedDerivationPath,
  defaultSparkWalletDerivationPath,
  evoluOwnerDerivationPath,
  linkyAppOwnerDerivationPath,
} from "./key-derivation.ts"

const paths = [
  cashuWalletSeedDerivationPath,
  linkyAppOwnerDerivationPath,
  evoluOwnerDerivationPath,
  defaultSparkWalletDerivationPath,
  "m/0'",
  "m/2147483647'/1'/0'",
]

describe("deriveHardenedPrivateKey", () => {
  test("derives HDKey's private key for Payky's paths, over random seeds", () => {
    for (let round = 0; round < 50; round++) {
      const seed = crypto.getRandomValues(new Uint8Array(round % 2 ? 16 : 64))
      for (const path of paths) {
        const indexes = parseHardenedPath(path)
        expect(indexes).not.toBeNull()
        if (indexes === null) continue
        expect(deriveHardenedPrivateKey(seed, indexes)).toEqual(
          HDKey.fromMasterSeed(seed).derive(path).privateKey
        )
      }
    }
  })

  test("matches BIP32 test vector 1 at m/0'", () => {
    const seed = Uint8Array.from(
      "000102030405060708090a0b0c0d0e0f".match(/../gu) ?? [],
      (byte) => Number.parseInt(byte, 16)
    )
    const indexes = parseHardenedPath("m/0'")
    expect(indexes).not.toBeNull()
    if (indexes === null) return
    expect(
      Buffer.from(deriveHardenedPrivateKey(seed, indexes)).toString("hex")
    ).toBe("edb2e14f9ee77d26dd93b4ecede8d16ed408ce149b6cd80b0715a2d911a0afea")
  })
})

describe("parseHardenedPath", () => {
  test("leaves any path with a non-hardened level to HDKey", () => {
    expect(parseHardenedPath("m/44'/1237'/0'/0/0")).toBeNull()
    expect(parseHardenedPath("44'/0'")).toBeNull()
    expect(parseHardenedPath("m/2147483648'")).toBeNull()
    expect(parseHardenedPath("m")).toEqual([])
  })
})
