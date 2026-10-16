import {
  createBlindSignature,
  createNewMintKeys,
  hashToCurve,
  JSONInt,
  pointFromHex,
  verifyMintQuoteSignature,
} from "@cashu/cashu-ts"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js"

import { createTestInvoice } from "../modules/shared/lightning-invoice-test-fixtures.ts"

/**
 * An in-memory Cashu mint behind a `fetch`: NUT-01/02 keys and keysets with
 * an input fee, NUT-04 mint quotes (NUT-20 locked ones too), NUT-05 melts with
 * NUT-08 change, NUT-03 swaps, NUT-07 state checks and NUT-09 restore. It signs
 * with real blind signatures, so cashu-ts and Payky's wallet code run against
 * it unchanged: unit tests, the demo account and the e2e suite use it instead
 * of a real mint.
 *
 * Failure injection (`failNext`) covers what Payky must survive: an
 * unreachable mint, the NUT error codes the wallet reacts to, and a response
 * lost after the mint already did the work.
 */

export type FakeMintFailure =
  /** Answers normally: queued first, it lets a later call fail instead. */
  | { readonly type: "ok" }
  | { readonly type: "unreachable" }
  | { readonly type: "lostResponse" }
  | { readonly type: "error"; readonly code: number; readonly detail: string }

export type FakeMintEndpoint =
  | "info"
  | "keysets"
  | "keys"
  | "mintQuote"
  | "checkMintQuote"
  | "mint"
  | "swap"
  | "checkstate"
  | "restore"
  | "meltQuote"
  | "checkMeltQuote"
  | "melt"

interface MintQuote {
  readonly quote: string
  readonly request: string
  readonly amount: number
  readonly expiry: number
  readonly pubkey: string | null
  state: "UNPAID" | "PAID" | "ISSUED"
}

interface MeltQuote {
  readonly quote: string
  readonly request: string
  readonly amount: number
  readonly feeReserve: number
  readonly expiry: number
  state: "UNPAID" | "PENDING" | "PAID"
  change: ReadonlyArray<SignedOutput> | null
  preimage: string | null
}

interface BlindedMessage {
  readonly amount: number
  readonly id: string
  readonly B_: string
}

interface SignedOutput {
  readonly amount: number
  readonly id: string
  readonly C_: string
}

interface InputProof {
  readonly amount: number
  readonly id: string
  readonly secret: string
  readonly C: string
}

export interface FakeCashuMintOptions {
  readonly url: string
  readonly inputFeePpk?: number
  readonly supportsNut07?: boolean
  readonly supportsNut20?: boolean
  readonly name?: string
  /** Seed of the keyset keys; two mints with one seed list the same keyset. */
  readonly keySeed?: Uint8Array
  readonly now?: () => number
  /** What a melt pays out of the reserve; the rest comes back as change. */
  readonly meltFee?: number
  /** Melt quotes whose invoice decodes to no amount use this. */
  readonly invoiceAmounts?: Map<string, number>
  /** A melt paid this invoice: the "Lightning network" between fake mints. */
  readonly onInvoicePaid?: (invoice: string) => void
}

class FakeMintHttpError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(status: number, body: unknown) {
    super(`fake mint ${status}`)
    this.status = status
    this.body = body
  }
}

const mintError = (code: number, detail: string) =>
  new FakeMintHttpError(400, { code, detail })

const toNumber = (value: unknown): number => Number(value)

const yOf = (secret: string): string =>
  hashToCurve(new TextEncoder().encode(secret)).toHex(true)

/** `lnbc<amount×10>n…`: an invoice light-bolt11-decoder reads, for `sats`. */
const fakeInvoice = (sats: number, seq: number, now: number): string =>
  createTestInvoice({
    hrp: `lnbc${sats * 10}n`,
    timestamp: Math.floor(now / 1000),
    expirySeconds: 600 + seq,
    description: `fake mint quote ${seq}`,
  })

export const createFakeCashuMint = (options: FakeCashuMintOptions) => {
  const now = options.now ?? Date.now
  const inputFeePpk = options.inputFeePpk ?? 0
  const keyset = createNewMintKeys(
    21,
    options.keySeed ??
      sha256(new TextEncoder().encode(`fake-mint:${options.url}`)),
    { input_fee_ppk: inputFeePpk, unit: "sat" }
  )
  const mintQuotes = new Map<string, MintQuote>()
  const meltQuotes = new Map<string, MeltQuote>()
  /** B_ → the signature, for NUT-09 and "outputs already signed". */
  const signed = new Map<string, SignedOutput>()
  const spentYs = new Set<string>()
  const pendingFailures = new Map<FakeMintEndpoint, FakeMintFailure[]>()
  const meltOutcomes: Array<"PAID" | "UNPAID"> = []
  let sequence = 0
  const counts = new Map<FakeMintEndpoint, number>()

  const privateKeyFor = (amount: number): Uint8Array => {
    const key = keyset.privKeys[String(amount)]
    if (key === undefined) throw mintError(11005, `no key for amount ${amount}`)
    return key
  }

  const sign = (output: BlindedMessage): SignedOutput => {
    if (output.id !== keyset.keysetId)
      throw mintError(12001, "keyset not known")
    if (signed.has(output.B_))
      throw mintError(11003, "outputs have already been signed before")
    const signature = createBlindSignature(
      pointFromHex(output.B_),
      privateKeyFor(output.amount),
      keyset.keysetId
    )
    const result = {
      amount: output.amount,
      id: keyset.keysetId,
      C_: signature.C_.toHex(true),
    }
    return result
  }

  /** Signs every output or none: a rejected batch records nothing. */
  const signAll = (
    outputs: ReadonlyArray<BlindedMessage>
  ): ReadonlyArray<SignedOutput> => {
    const unique = new Set(outputs.map((output) => output.B_))
    if (unique.size !== outputs.length)
      throw mintError(11008, "duplicate outputs")
    const signatures = outputs.map(sign)
    outputs.forEach((output, index) => {
      const signature = signatures[index]
      if (signature !== undefined) signed.set(output.B_, signature)
    })
    return signatures
  }

  const inputFee = (count: number): number =>
    Math.floor((count * inputFeePpk + 999) / 1000)

  const verifyInputs = (inputs: ReadonlyArray<InputProof>): number => {
    const ys = inputs.map((input) => yOf(input.secret))
    if (new Set(ys).size !== ys.length)
      throw mintError(11007, "duplicate inputs")
    for (const [index, input] of inputs.entries()) {
      if (input.id !== keyset.keysetId)
        throw mintError(12001, "keyset not known")
      const key = BigInt(`0x${bytesToHex(privateKeyFor(input.amount))}`)
      const expected = hashToCurve(
        new TextEncoder().encode(input.secret)
      ).multiply(key)
      if (!pointFromHex(input.C).equals(expected))
        throw mintError(10003, "could not verify proofs")
      if (spentYs.has(ys[index] ?? ""))
        throw mintError(11001, "Token already spent.")
    }
    return inputs.reduce((sum, input) => sum + input.amount, 0)
  }

  const parseOutputs = (raw: unknown): ReadonlyArray<BlindedMessage> =>
    (Array.isArray(raw) ? raw : []).map((output: Record<string, unknown>) => ({
      amount: toNumber(output.amount),
      id: String(output.id),
      B_: String(output.B_),
    }))

  const parseInputs = (raw: unknown): ReadonlyArray<InputProof> =>
    (Array.isArray(raw) ? raw : []).map((input: Record<string, unknown>) => ({
      amount: toNumber(input.amount),
      id: String(input.id),
      secret: String(input.secret),
      C: String(input.C),
    }))

  const mintQuoteJson = (quote: MintQuote) => ({
    quote: quote.quote,
    request: quote.request,
    amount: quote.amount,
    unit: "sat",
    state: quote.state,
    expiry: quote.expiry,
    ...(quote.pubkey === null ? {} : { pubkey: quote.pubkey }),
  })

  const meltQuoteJson = (quote: MeltQuote) => ({
    quote: quote.quote,
    request: quote.request,
    amount: quote.amount,
    unit: "sat",
    fee_reserve: quote.feeReserve,
    state: quote.state,
    expiry: quote.expiry,
    payment_preimage: quote.preimage,
    ...(quote.change === null ? {} : { change: quote.change }),
  })

  const findMintQuote = (id: string): MintQuote => {
    const quote = mintQuotes.get(id)
    if (quote === undefined) throw mintError(20004, "quote not found")
    return quote
  }

  const findMeltQuote = (id: string): MeltQuote => {
    const quote = meltQuotes.get(id)
    if (quote === undefined) throw mintError(20004, "quote not found")
    return quote
  }

  const invoiceAmount = (request: string): number => {
    const registered = options.invoiceAmounts?.get(request)
    if (registered !== undefined) return registered
    const match = /^lnbc(\d+)([munp]?)1/u.exec(request.toLowerCase())
    if (match === null) throw mintError(20000, "cannot decode invoice")
    const value = Number(match[1])
    const unitSats = { "": 1e8, m: 1e5, u: 100, n: 0.1, p: 0.0001 }[
      (match[2] ?? "") as "" | "m" | "u" | "n" | "p"
    ]
    return Math.ceil(value * unitSats)
  }

  type Handler = (body: Record<string, unknown>, param: string) => unknown

  const routes: ReadonlyArray<{
    readonly method: "GET" | "POST"
    readonly pattern: RegExp
    readonly endpoint: FakeMintEndpoint
    readonly handle: Handler
  }> = [
    {
      method: "GET",
      pattern: /^\/v1\/info$/u,
      endpoint: "info",
      handle: () => ({
        name: options.name ?? "Fake mint",
        pubkey: bytesToHex(keyset.pubKeys["1"] ?? new Uint8Array(33)),
        version: "fake/1.0.0",
        contact: [],
        nuts: {
          "4": {
            methods: [{ method: "bolt11", unit: "sat" }],
            disabled: false,
          },
          "5": {
            methods: [{ method: "bolt11", unit: "sat" }],
            disabled: false,
          },
          "7": { supported: options.supportsNut07 ?? true },
          "8": { supported: true },
          "9": { supported: true },
          // Listed so cashu-ts locks tokens to a key here, as it does at a
          // real mint; this one takes the witness without checking it.
          "11": { supported: true },
          "12": { supported: false },
          "20": { supported: options.supportsNut20 ?? false },
        },
      }),
    },
    {
      method: "GET",
      pattern: /^\/v1\/keysets$/u,
      endpoint: "keysets",
      handle: () => ({
        keysets: [
          {
            id: keyset.keysetId,
            unit: "sat",
            active: true,
            input_fee_ppk: inputFeePpk,
          },
        ],
      }),
    },
    {
      method: "GET",
      pattern: /^\/v1\/keys(?:\/([0-9a-f]+))?$/u,
      endpoint: "keys",
      handle: (_body, id) => {
        if (id !== "" && id !== keyset.keysetId)
          throw mintError(12001, "keyset not known")
        return {
          keysets: [
            {
              id: keyset.keysetId,
              unit: "sat",
              active: true,
              input_fee_ppk: inputFeePpk,
              keys: Object.fromEntries(
                Object.entries(keyset.pubKeys).map(([amount, key]) => [
                  amount,
                  bytesToHex(key),
                ])
              ),
            },
          ],
        }
      },
    },
    {
      method: "POST",
      pattern: /^\/v1\/mint\/quote\/bolt11$/u,
      endpoint: "mintQuote",
      handle: (body) => {
        const amount = toNumber(body.amount)
        sequence += 1
        const quote: MintQuote = {
          quote: `mint-quote-${sequence}`,
          request: fakeInvoice(amount, sequence, now()),
          amount,
          expiry: Math.floor(now() / 1000) + 600,
          pubkey: typeof body.pubkey === "string" ? body.pubkey : null,
          state: "UNPAID",
        }
        if (quote.pubkey !== null && options.supportsNut20 !== true)
          throw mintError(20009, "locked quotes are not supported")
        mintQuotes.set(quote.quote, quote)
        return mintQuoteJson(quote)
      },
    },
    {
      method: "GET",
      pattern: /^\/v1\/mint\/quote\/bolt11\/(.+)$/u,
      endpoint: "checkMintQuote",
      handle: (_body, id) => mintQuoteJson(findMintQuote(id)),
    },
    {
      method: "POST",
      pattern: /^\/v1\/mint\/bolt11$/u,
      endpoint: "mint",
      handle: (body) => {
        const quote = findMintQuote(String(body.quote))
        if (quote.state === "UNPAID") throw mintError(20001, "quote not paid")
        if (quote.state === "ISSUED")
          throw mintError(20002, "quote already issued")
        const outputs = parseOutputs(body.outputs)
        if (quote.pubkey !== null) {
          const valid =
            typeof body.signature === "string" &&
            verifyMintQuoteSignature(
              quote.pubkey,
              quote.quote,
              outputs.map((output) => ({
                amount: output.amount,
                id: output.id,
                B_: output.B_,
              })) as never,
              body.signature
            )
          if (!valid) throw mintError(20008, "mint quote signature invalid")
        }
        const total = outputs.reduce((sum, output) => sum + output.amount, 0)
        if (total !== quote.amount)
          throw mintError(11002, "outputs do not match the quote amount")
        const signatures = signAll(outputs)
        quote.state = "ISSUED"
        return { signatures }
      },
    },
    {
      method: "POST",
      pattern: /^\/v1\/swap$/u,
      endpoint: "swap",
      handle: (body) => {
        const inputs = parseInputs(body.inputs)
        const outputs = parseOutputs(body.outputs)
        const inputTotal = verifyInputs(inputs)
        const outputTotal = outputs.reduce(
          (sum, output) => sum + output.amount,
          0
        )
        if (inputTotal - inputFee(inputs.length) !== outputTotal)
          throw mintError(11002, "inputs and outputs are not balanced")
        const signatures = signAll(outputs)
        for (const input of inputs) spentYs.add(yOf(input.secret))
        return { signatures }
      },
    },
    {
      method: "POST",
      pattern: /^\/v1\/checkstate$/u,
      endpoint: "checkstate",
      handle: (body) => {
        if (options.supportsNut07 === false)
          throw new FakeMintHttpError(404, { detail: "not found" })
        const ys = Array.isArray(body.Ys) ? body.Ys.map(String) : []
        return {
          states: ys.map((y) => ({
            Y: y,
            state: spentYs.has(y) ? "SPENT" : "UNSPENT",
            witness: null,
          })),
        }
      },
    },
    {
      method: "POST",
      pattern: /^\/v1\/restore$/u,
      endpoint: "restore",
      handle: (body) => {
        const outputs = parseOutputs(body.outputs).filter((output) =>
          signed.has(output.B_)
        )
        const signatures = outputs.flatMap((output) => {
          const signature = signed.get(output.B_)
          return signature === undefined ? [] : [signature]
        })
        return { outputs, signatures, promises: signatures }
      },
    },
    {
      method: "POST",
      pattern: /^\/v1\/melt\/quote\/bolt11$/u,
      endpoint: "meltQuote",
      handle: (body) => {
        const request = String(body.request)
        const amount = invoiceAmount(request)
        sequence += 1
        const quote: MeltQuote = {
          quote: `melt-quote-${sequence}`,
          request,
          amount,
          feeReserve: Math.max(2, Math.ceil(amount * 0.01)),
          expiry: Math.floor(now() / 1000) + 600,
          state: "UNPAID",
          change: null,
          preimage: null,
        }
        meltQuotes.set(quote.quote, quote)
        return meltQuoteJson(quote)
      },
    },
    {
      method: "GET",
      pattern: /^\/v1\/melt\/quote\/bolt11\/(.+)$/u,
      endpoint: "checkMeltQuote",
      handle: (_body, id) => meltQuoteJson(findMeltQuote(id)),
    },
    {
      method: "POST",
      pattern: /^\/v1\/melt\/bolt11$/u,
      endpoint: "melt",
      handle: (body) => {
        const quote = findMeltQuote(String(body.quote))
        if (quote.state === "PAID")
          throw mintError(20006, "invoice already paid")
        const inputs = parseInputs(body.inputs)
        const inputTotal = verifyInputs(inputs)
        const needed = quote.amount + quote.feeReserve + inputFee(inputs.length)
        if (inputTotal < needed)
          throw mintError(11002, "not enough inputs for the melt")
        const outcome = meltOutcomes.shift() ?? "PAID"
        if (outcome === "UNPAID") return meltQuoteJson(quote)
        for (const input of inputs) spentYs.add(yOf(input.secret))
        const changeAmount =
          inputTotal -
          quote.amount -
          (options.meltFee ?? 0) -
          inputFee(inputs.length)
        const blanks = parseOutputs(body.outputs)
        const change: BlindedMessage[] = []
        let remaining = changeAmount
        for (const blank of blanks) {
          if (remaining <= 0) break
          let amount = 1
          while (amount * 2 <= remaining) amount *= 2
          change.push({ ...blank, amount })
          remaining -= amount
        }
        quote.state = "PAID"
        quote.preimage = "00".repeat(32)
        options.onInvoicePaid?.(quote.request)
        quote.change = signAll(change)
        return meltQuoteJson(quote)
      },
    },
  ]

  const respond = (status: number, body: unknown): Response =>
    new Response(JSONInt.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })

  const handles = (url: string): boolean => url.startsWith(options.url)

  const fetchFake: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname.slice(
      new URL(options.url).pathname.replace(/\/$/u, "").length
    )
    const route = routes.find(
      (candidate) =>
        candidate.method === request.method && candidate.pattern.test(path)
    )
    if (route === undefined) return respond(404, { detail: "not found" })
    counts.set(route.endpoint, (counts.get(route.endpoint) ?? 0) + 1)
    const failure = pendingFailures.get(route.endpoint)?.shift()
    if (failure?.type === "unreachable")
      throw new TypeError("Failed to fetch (fake mint unreachable)")
    const text = request.method === "POST" ? await request.text() : ""
    const body = (text === "" ? {} : JSONInt.parse(text)) as Record<
      string,
      unknown
    >
    if (failure?.type === "error")
      return respond(400, { code: failure.code, detail: failure.detail })
    try {
      const result = route.handle(
        body,
        decodeURIComponent(route.pattern.exec(path)?.[1] ?? "")
      )
      if (failure?.type === "lostResponse")
        throw new TypeError("Failed to fetch (response lost)")
      return respond(200, result)
    } catch (error) {
      if (error instanceof FakeMintHttpError)
        return respond(error.status, error.body)
      throw error
    }
  }

  return {
    url: options.url,
    keysetId: keyset.keysetId,
    handles,
    fetch: fetchFake,
    /** The customer paid the quote's invoice. */
    payMintQuote: (quoteId: string) => {
      const quote = findMintQuote(quoteId)
      if (quote.state === "UNPAID") quote.state = "PAID"
    },
    mintQuoteState: (quoteId: string) => mintQuotes.get(quoteId)?.state ?? null,
    /** Someone paid this invoice, if it is one of this mint's quotes. */
    payInvoice: (invoice: string) => {
      for (const quote of mintQuotes.values())
        if (quote.request === invoice && quote.state === "UNPAID")
          quote.state = "PAID"
    },
    mintQuoteIds: () => [...mintQuotes.keys()],
    /** The next melt answers this instead of paying. */
    queueMeltOutcome: (outcome: "PAID" | "UNPAID") => {
      meltOutcomes.push(outcome)
    },
    failNext: (endpoint: FakeMintEndpoint, failure: FakeMintFailure) => {
      pendingFailures.set(endpoint, [
        ...(pendingFailures.get(endpoint) ?? []),
        failure,
      ])
    },
    isSpent: (secret: string) => spentYs.has(yOf(secret)),
    signedCount: () => signed.size,
    requestCount: (endpoint: FakeMintEndpoint) => counts.get(endpoint) ?? 0,
    /** The private key of one denomination, for tests that forge proofs. */
    hexPrivateKey: (amount: number) => bytesToHex(privateKeyFor(amount)),
    publicKey: (amount: number) =>
      bytesToHex(keyset.pubKeys[String(amount)] ?? hexToBytes("")),
  }
}

export type FakeCashuMint = ReturnType<typeof createFakeCashuMint>

/** One `fetch` over several fake mints; anything else is unreachable. */
export const createFakeMintsFetch =
  (mints: ReadonlyArray<FakeCashuMint>): typeof globalThis.fetch =>
  (input, init) => {
    const url = new Request(input, init).url
    const mint = mints.find((candidate) => candidate.handles(url))
    if (mint === undefined)
      return Promise.reject(new TypeError(`no fake mint at ${url}`))
    return mint.fetch(input, init)
  }
