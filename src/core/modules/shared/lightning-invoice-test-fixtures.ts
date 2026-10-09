import { bech32, bech32m, hex } from "@scure/base"

/**
 * Builds BOLT11 invoices for tests, laid out the way the Spark SSP lays them
 * out: a Spark fallback either as a version-31 `fallback_address` holding a
 * Spark invoice (`includeSparkInvoice`, which Payky asks for) or as a route
 * hint with the `f42400f424000001` short channel id (`includeSparkAddress`).
 * The signature is zeros; neither our parser nor the decoder checks it.
 */
const encodeBech32 = (
  hrp: string,
  words: ReadonlyArray<number>,
  variant: "bech32" | "bech32m"
): string =>
  (variant === "bech32" ? bech32 : bech32m).encode(
    hrp,
    [...words],
    Number.MAX_SAFE_INTEGER
  )

const toWords = (bytes: ReadonlyArray<number>): number[] =>
  bech32.toWords(Uint8Array.from(bytes))

const intWords = (value: number, length: number): number[] =>
  Array.from(
    { length },
    (_, i) => Math.floor(value / 32 ** (length - 1 - i)) % 32
  )

const hexBytes = (value: string): number[] => Array.from(hex.decode(value))

const tagged = (tag: number, words: ReadonlyArray<number>): number[] => [
  tag,
  ...intWords(words.length, 2),
  ...words,
]

export const testSparkIdentity = `02${"ab".repeat(32)}`

/** A Spark invoice (`spark1…`) for `identity`, as an SSP embeds it. */
export const createTestSparkInvoice = (identity: string): string =>
  encodeBech32(
    "spark",
    // field 1: identity public key; field 2: opaque invoice fields
    toWords([0x0a, 33, ...hexBytes(identity), 0x12, 2, 0x08, 0x01]),
    "bech32m"
  )

export const createTestInvoice = ({
  hrp = "lnbc",
  timestamp = 1_780_000_000,
  expirySeconds,
  description,
  descriptionHash,
  sparkFallback,
}: {
  readonly hrp?: string
  readonly timestamp?: number
  readonly expirySeconds?: number
  readonly description?: string
  /** 64 hex characters. */
  readonly descriptionHash?: string
  readonly sparkFallback?: {
    readonly via: "fallback-address" | "route-hint"
    readonly identity: string
  }
} = {}): string => {
  const words = [
    ...intWords(timestamp, 7),
    ...tagged(1, toWords(hexBytes("11".repeat(32)))),
    ...tagged(16, toWords(hexBytes("22".repeat(32)))),
    ...(description === undefined
      ? []
      : tagged(13, toWords(Array.from(new TextEncoder().encode(description))))),
    ...(descriptionHash === undefined
      ? []
      : tagged(23, toWords(hexBytes(descriptionHash)))),
    ...(expirySeconds === undefined
      ? []
      : tagged(6, intWords(expirySeconds, 4))),
    ...(sparkFallback?.via === "fallback-address"
      ? tagged(9, [
          31,
          ...toWords(
            Array.from(
              new TextEncoder().encode(
                createTestSparkInvoice(sparkFallback.identity)
              )
            )
          ),
        ])
      : []),
    ...(sparkFallback?.via === "route-hint"
      ? tagged(
          3,
          toWords([
            ...hexBytes(sparkFallback.identity),
            ...hexBytes("f42400f424000001"),
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            144,
          ])
        )
      : []),
    ...Array.from({ length: 104 }, () => 0),
  ]
  return encodeBech32(hrp, words, "bech32")
}
