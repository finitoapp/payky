import { ok } from "@evolu/common"
import {
  buildBip321PaymentUri,
  encodeNostrPaymentRequest,
  pickBip321PayableLeg,
} from "@payky/core/cashu/cashu-payment-request"
import {
  createCashuWalletDep,
  loadCashuWallet,
} from "@payky/core/cashu/cashu-wallet"
import { createFakeCashuMint } from "@payky/core/cashu/fake-cashu-mint"
import { withCashuCounter } from "@payky/core/modules/cashu/cashu-counter-actions"
import { cashuCounterQuery } from "@payky/core/modules/cashu/cashu-queries"
import {
  CashuQuoteId,
  CashuTokenText,
  MintUrl,
} from "@payky/core/modules/cashu/cashu-types"
import {
  cashuMeltOperationIdFor,
  cashuProofIdFor,
  cashuReceiveOperationIdFor,
  cashuTopupOperationIdFor,
  normalizeCashuTokenText,
  normalizeMintUrl,
} from "@payky/core/modules/cashu/cashu-utils"
import { CashuWalletSeed } from "@payky/core/modules/shared/key-derivation"
import { useAtomValue } from "jotai"
import { useState } from "react"
import { Text, View } from "tamagui"
import { evoluAtom } from "../../atoms/evolu.ts"
import { Button } from "../../components/ui/button.tsx"
import { nativeRun } from "../../core/native-runtime.ts"
import { lockManager } from "../../platform/evolu-runtime"

/*
 * Vectors below are COPIED from `packages/core/src/modules/cashu/
 * cashu-utils.test.ts` and `packages/core/src/cashu/cashu-payment-
 * request.test.ts`, run again on Hermes. Keep them identical to those files.
 */

const MINT_URL_VECTORS: ReadonlyArray<
  readonly [input: string, normalized: string | null]
> = [
  ["https://cashu.cz", "https://cashu.cz"],
  [" https://cashu.cz/ ", "https://cashu.cz"],
  ["https://cashu.cz///", "https://cashu.cz"],
  ["https://mint.minibits.cash", "https://mint.minibits.cash/Bitcoin"],
  ["https://MINT.minibits.cash/Bitcoin/", "https://mint.minibits.cash/Bitcoin"],
  [
    "https://mint.minibits.cash/Bitcoin?x=1",
    "https://mint.minibits.cash/Bitcoin",
  ],
  ["https://mint.example.com/path/?a=1#x", "https://mint.example.com/path"],
  ["HTTPS://Cashu.CZ", "https://cashu.cz"],
  ["http://localhost:3338/", "http://localhost:3338"],
  ["https://kashu.me/sub/path//", "https://kashu.me/sub/path"],
  ["https://user:pw@mint.example.com/", "https://mint.example.com"],
  ["cashu.cz", null],
  ["", null],
  ["ftp://x.y", null],
]

/** Operation ids every device derives alike. */
const OPERATION_ID_VECTORS = {
  topup: "BGlgDe11qmFny9YMFDFEMA",
  receive: "Jp7BJO58G7fLgNCYxFZ5vw",
  melt: "v8OkMn4X0n6QC4aCZBJqWQ",
}

const PROOF_ID_VECTOR = {
  secret: "407915bc212be61a77e3e6d2aeb4c727980bda51cd06a6afc29e2861768a7837",
  id: "BZPKWM_sfeFRihXDyPbdLw",
}

/** `buildBip321PaymentUri`, then `pickBip321PayableLeg` of its parse. */
const BIP321_VECTORS: ReadonlyArray<{
  readonly legs: { readonly lightning?: string; readonly creq?: string }
  readonly uri: string | null
  readonly leg: { readonly kind: string; readonly value: string } | null
}> = [
  {
    legs: { lightning: "lightning:LNBC10N1PXYZ" },
    uri: "bitcoin:?lightning=LNBC10N1PXYZ",
    leg: { kind: "lightning", value: "LNBC10N1PXYZ" },
  },
  {
    legs: { lightning: "lnbc10n1pxyz", creq: "creqAabc+/=" },
    uri: "bitcoin:?lightning=lnbc10n1pxyz&creq=creqAabc%2B%2F%3D",
    leg: { kind: "cashu-request", value: "creqAabc+/=" },
  },
  {
    legs: { creq: "creqAabc" },
    uri: "bitcoin:?creq=creqAabc",
    leg: { kind: "cashu-request", value: "creqAabc" },
  },
  { legs: {}, uri: null, leg: null },
  {
    legs: { lightning: " lnbc10n1pxyz ", creq: "" },
    uri: "bitcoin:?lightning=lnbc10n1pxyz",
    leg: { kind: "lightning", value: "lnbc10n1pxyz" },
  },
]

/** What `encodeNostrPaymentRequest` makes of these. */
const NUT18_VECTORS = [
  {
    args: {
      amount: 8600,
      mintUrls: ["https://cashu.cz"],
      recipientNprofile: "nprofile1qqsxyz",
      requestId: "pay-1",
      description: "Coffee",
    },
    request:
      "creqAuQAHYWEZIZhhdWNzYXRhc_VhbYFwaHR0cHM6Ly9jYXNodS5jemF0gbkAA2F0ZW5vc3RyYWFvbnByb2ZpbGUxcXFzeHl6YWeBgmFuYjE3YWllcGF5LTFhZGZDb2ZmZWU",
  },
  {
    args: {
      amount: 21,
      mintUrls: ["https://cashu.cz", " "],
      recipientNprofile: "nprofile1abc",
      requestId: null,
      description: "  ",
    },
    request:
      "creqAuQAFYWEVYXVjc2F0YXP1YW2BcGh0dHBzOi8vY2FzaHUuY3phdIG5AANhdGVub3N0cmFhbG5wcm9maWxlMWFiY2FngYJhbmIxNw",
  },
]

/** What a receive's operation id hashes. */
const TOKEN_TEXT_VECTORS: ReadonlyArray<
  readonly [input: string, tokenText: string | null]
> = [
  [
    '{"id":"pay-1","memo":"Káva","mint":"https://cashu.cz","unit":"sat","proofs":[{"id":"00ad268c4d1f5826","amount":8,"secret":"s1","C":"02aa","dleq":{"e":"x"}},{"amount":2,"id":"00ad268c4d1f5826","secret":"s2","C":"02bb"}]}',
    "cashuAeyJ0b2tlbiI6W3sibWludCI6Imh0dHBzOi8vY2FzaHUuY3oiLCJwcm9vZnMiOlt7ImlkIjoiMDBhZDI2OGM0ZDFmNTgyNiIsImFtb3VudCI6OCwic2VjcmV0IjoiczEiLCJDIjoiMDJhYSIsImRsZXEiOnsiZSI6IngifX0seyJhbW91bnQiOjIsImlkIjoiMDBhZDI2OGM0ZDFmNTgyNiIsInNlY3JldCI6InMyIiwiQyI6IjAyYmIifV19XSwidW5pdCI6InNhdCJ9",
  ],
  ["  cashuBo2FteBhodHRwczovL2NAA  ", "cashuBo2FteBhodHRwczovL2NAA"],
  ["cashuB with space", null],
  ["hello", null],
]

const check = (name: string, actual: unknown, expected: unknown): string =>
  JSON.stringify(actual) === JSON.stringify(expected)
    ? `PASS ${name}`
    : `FAIL ${name}: got ${JSON.stringify(actual)}`

const runVectors = (): string[] => [
  ...TOKEN_TEXT_VECTORS.map(([input, out], i) =>
    check(`tokenText#${i}`, normalizeCashuTokenText(input), out)
  ),
  ...NUT18_VECTORS.map((v, i) =>
    check(`nut18#${i}`, encodeNostrPaymentRequest(v.args), v.request)
  ),
  ...BIP321_VECTORS.map((v, i) =>
    check(
      `bip321#${i}`,
      [
        buildBip321PaymentUri(v.legs),
        v.uri === null ? null : pickBip321PayableLeg(v.uri),
      ],
      [v.uri, v.leg]
    )
  ),
  ...MINT_URL_VECTORS.map(([input, out], i) =>
    check(`mintUrl#${i}`, normalizeMintUrl(input), out)
  ),
  check(
    "operationIds",
    {
      topup: cashuTopupOperationIdFor(
        MintUrl("https://cashu.cz"),
        CashuQuoteId("q1")
      ),
      receive: cashuReceiveOperationIdFor(CashuTokenText("cashuBabc")),
      melt: cashuMeltOperationIdFor(
        MintUrl("https://cashu.cz"),
        CashuQuoteId("m1")
      ),
    },
    OPERATION_ID_VECTORS
  ),
  check("proofId", cashuProofIdFor(PROOF_ID_VECTOR.secret), PROOF_ID_VECTOR.id),
]

/**
 * Diagnostic mint: a fixed fake URL and key seed, so its keyset id (and thus
 * the counter scope) is identical on every launch. Counters are keyed by
 * mint|unit|keyset, so this scope can never collide with a real mint.
 */
const DIAGNOSTIC_MINT = MintUrl("https://diagnostic.fake-mint.invalid")
const DIAGNOSTIC_KEY_SEED = new Uint8Array(32).fill(7)

export function CashuCard() {
  const evolu = useAtomValue(evoluAtom)
  const [text, setText] = useState("-")
  const [busy, setBusy] = useState(false)

  const act = async (work: () => Promise<string>) => {
    setBusy(true)
    setText("running")
    try {
      setText(await work())
    } catch (error) {
      setText(`thrown ${String(error).slice(0, 300)}`)
    }
    setBusy(false)
  }

  const makeDeps = () => {
    const fake = createFakeCashuMint({
      url: DIAGNOSTIC_MINT,
      keySeed: DIAGNOSTIC_KEY_SEED,
    })
    return {
      fake,
      deps: {
        // The account's database: the diagnostic mint's keyset owns no proof
        // there, and its counter scope is its own.
        evolu,
        evoluOwner: evolu.appOwner,
        lockManager,
        // Throwaway seed per press, never the account's.
        ...createCashuWalletDep({
          seed: CashuWalletSeed(crypto.getRandomValues(new Uint8Array(64))),
          fetch: fake.fetch,
        }),
      },
    }
  }

  const vectorsAndMint = () =>
    act(async () => {
      const lines = runVectors()
      lines.push("-- simulated (fake mint) --")
      const { fake, deps } = makeDeps()
      await using run = nativeRun.create(deps)
      const loaded = await run(loadCashuWallet(DIAGNOSTIC_MINT))
      if (!loaded.ok)
        return [...lines, `load failed ${loaded.error.type}`].join("\n")
      const { wallet, keysetId } = loaded.value
      lines.push(`keyset ${keysetId}`)
      const quote = await wallet.createMintQuoteBolt11(21)
      fake.payMintQuote(quote.quote)
      const proofs = await wallet.mintProofsBolt11(21, quote.quote)
      const total = proofs.reduce((sum, p) => sum + Number(p.amount), 0)
      lines.push(`minted ${proofs.length} proofs, ${total} sat`)
      return lines.join("\n")
    })

  const reserve = () =>
    act(async () => {
      const { deps } = makeDeps()
      await using run = nativeRun.create(deps)
      const loaded = await run(loadCashuWallet(DIAGNOSTIC_MINT))
      if (!loaded.ok) return `load failed ${loaded.error.type}`
      const { keysetId } = loaded.value
      const result = await run(
        withCashuCounter(loaded.value, keysetId, (held) => async () => {
          const before = held.current()
          const after = await held.advanceTo(before + 5)
          return ok({ before, after })
        })
      )
      if (!result.ok) return `reserve failed ${result.error.type}`
      const [row] = await evolu.loadQuery(
        cashuCounterQuery(DIAGNOSTIC_MINT, keysetId)
      )
      return `counter ${result.value.before} -> ${result.value.after}\nstored: ${row?.next ?? "none"}`
    })

  return (
    <View gap="2">
      <Text fontWeight="600">Cashu (fake mint + vectors)</Text>
      <Button variant="outline" disabled={busy} onPress={vectorsAndMint}>
        Cashu: vectors + fake mint
      </Button>
      <Button variant="outline" disabled={busy} onPress={reserve}>
        Cashu: reserve 5 counters
      </Button>
      <Text>{text}</Text>
    </View>
  )
}
