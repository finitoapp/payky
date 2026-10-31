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
import { z } from "zod"

import { createTestInvoice } from "../modules/shared/lightning-invoice-test-fixtures.ts"
import { jsonCodec } from "../zod-utils.ts"

/**
 * An in-memory Cashu mint behind a `fetch`: NUT-01/02 keys and keysets with
 * an input fee, NUT-04 mint quotes (NUT-20 locked ones too), NUT-05 melts with
 * NUT-08 change, NUT-03 swaps, NUT-07 state checks and NUT-09 restore, and,
 * when asked, NUT-17 pushes of a mint quote's state. It signs
 * with real blind signatures, so cashu-ts and Payky's wallet code run against
 * it unchanged: unit tests, the demo account and the e2e suite use it instead
 * of a real mint.
 *
 * Failure injection (`failNext`) covers what Payky must survive: an
 * unreachable mint, the NUT error codes the wallet reacts to, a response
 * lost after the mint already did the work, another call landing right
 * after one was answered, and a request held in the mint's queue past the
 * caller's decisions (`deferred`).
 */

export type FakeMintFailure =
  /** Answers normally: queued first, it lets a later call fail instead. */
  | { readonly type: "ok" }
  | { readonly type: "unreachable" }
  | { readonly type: "lostResponse" }
  /** Does the work, then answers a body that does not parse. */
  | { readonly type: "garbledResponse" }
  | { readonly type: "error"; readonly code: number; readonly detail: string }
  /**
   * Does the work, then runs `run` before the answer reaches the caller:
   * another call landing right after this one was answered.
   */
  | { readonly type: "then"; readonly run: () => Promise<void> | void }
  /**
   * Holds the request in the mint's queue and answers the caller as a lost
   * response: the mint does the work only when the test delivers it
   * (`deliverDeferred`), after anything the caller decided meanwhile, or
   * never (`dropDeferred`). With `answer`, the caller hears that NUT-00
   * error instead, as a copy of the request (a proxy's retry) is refused
   * while the original is being paid; a melt held so keeps its quote and
   * its inputs PENDING until it is delivered or dropped.
   */
  | {
      readonly type: "deferred"
      readonly answer?: { readonly code: number; readonly detail: string }
    }

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
  readonly supportsNut09?: boolean
  readonly supportsNut20?: boolean
  /**
   * Pushes a bolt11 mint quote's state over a websocket (NUT-17), the one
   * `createFakeMintsWebSocket` opens.
   */
  readonly supportsNut17?: boolean
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
  /**
   * The NUT-00 code set the mint answers in (cashu/0037): `current` by
   * default, `legacy` as mints before the 2026 renumbering do.
   */
  readonly errorCodes?: "current" | "legacy"
  /** False answers melt quotes with no expiry (0), as some mints do. */
  readonly meltQuotesExpire?: boolean
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

/** The refusals whose code and wording differ between the code sets. */
const versionedErrors = {
  current: {
    outputsSigned: [11003, "Outputs already signed"],
    unbalanced: [11005, "Transaction is not balanced (inputs != outputs)"],
  },
  legacy: {
    // CDK's wording; under 10002 the code alone decides.
    outputsSigned: [10002, "Blinded Message is already signed"],
    unbalanced: [11002, "Transaction is not balanced (inputs != outputs)"],
  },
} as const

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
  const versioned = versionedErrors[options.errorCodes ?? "current"]
  const versionedError = (kind: keyof typeof versioned) => {
    const [code, detail] = versioned[kind]
    return mintError(code, detail)
  }
  /** The Lightning fee reserve a melt quote asks, in percent of its amount. */
  let meltFeeReservePercent = 1
  const keySeed =
    options.keySeed ??
    sha256(new TextEncoder().encode(`fake-mint:${options.url}`))
  const createKeyset = (seed: Uint8Array) =>
    createNewMintKeys(21, seed, { input_fee_ppk: inputFeePpk, unit: "sat" })
  type Keyset = ReturnType<typeof createKeyset>
  /** Every keyset the mint ever had, the active one last (NUT-02). */
  const keysets: Keyset[] = [createKeyset(keySeed)]
  const activeKeyset = (): Keyset => {
    const active = keysets[keysets.length - 1]
    if (active === undefined) throw new Error("the fake mint has no keyset")
    return active
  }
  const knownKeyset = (id: string): Keyset => {
    const known = keysets.find((candidate) => candidate.keysetId === id)
    if (known === undefined) throw mintError(12001, "keyset not known")
    return known
  }
  const mintQuotes = new Map<string, MintQuote>()
  /** NUT-17 subscribers to mint quotes, told every state a quote takes. */
  const mintQuoteListeners = new Set<(quote: MintQuote) => void>()
  /** NUT-17 sockets open at this mint, by `createFakeMintsWebSocket`. */
  const openSockets = new Set<object>()
  const sockets = { attempts: 0, hang: false }
  const setMintQuoteState = (quote: MintQuote, state: MintQuote["state"]) => {
    quote.state = state
    for (const listener of mintQuoteListeners) listener(quote)
  }
  const meltQuotes = new Map<string, MeltQuote>()
  /** B_ → the signature, for NUT-09 and "outputs already signed". */
  const signed = new Map<string, SignedOutput>()
  const spentYs = new Set<string>()
  const pendingFailures = new Map<FakeMintEndpoint, FakeMintFailure[]>()
  const meltOutcomes: Array<"PAID" | "UNPAID"> = []
  /** Inputs of a melt the mint is paying now (NUT-07 PENDING). */
  const pendingYs = new Set<string>()
  /** Requests held by a `deferred` failure, by id, in the order they came. */
  const deferred = new Map<
    number,
    {
      readonly endpoint: FakeMintEndpoint
      readonly handle: () => unknown
      /** Ends what holding the request showed: a melt's PENDING. */
      readonly release: () => void
    }
  >()
  let deferredSequence = 0
  let sequence = 0
  const counts = new Map<FakeMintEndpoint, number>()

  const privateKeyFor = (keyset: Keyset, amount: number): Uint8Array => {
    const key = keyset.privKeys[String(amount)]
    if (key === undefined) throw mintError(11005, `no key for amount ${amount}`)
    return key
  }

  const sign = (output: BlindedMessage): SignedOutput => {
    const keyset = knownKeyset(output.id)
    if (keyset !== activeKeyset()) throw mintError(12002, "keyset is inactive")
    if (signed.has(output.B_)) throw versionedError("outputsSigned")
    const signature = createBlindSignature(
      pointFromHex(output.B_),
      privateKeyFor(keyset, output.amount),
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
      const key = BigInt(
        `0x${bytesToHex(privateKeyFor(knownKeyset(input.id), input.amount))}`
      )
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
        pubkey: bytesToHex(activeKeyset().pubKeys["1"] ?? new Uint8Array(33)),
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
          "9": { supported: options.supportsNut09 ?? true },
          // Listed so cashu-ts locks tokens to a key here, as it does at a
          // real mint; this one takes the witness without checking it.
          "11": { supported: true },
          "12": { supported: false },
          "20": { supported: options.supportsNut20 ?? false },
          ...(options.supportsNut17 === true
            ? {
                "17": {
                  supported: [
                    {
                      method: "bolt11",
                      unit: "sat",
                      commands: ["bolt11_mint_quote"],
                    },
                  ],
                },
              }
            : {}),
        },
      }),
    },
    {
      method: "GET",
      pattern: /^\/v1\/keysets$/u,
      endpoint: "keysets",
      handle: () => ({
        keysets: keysets.map((keyset) => ({
          id: keyset.keysetId,
          unit: "sat",
          active: keyset === activeKeyset(),
          input_fee_ppk: inputFeePpk,
        })),
      }),
    },
    {
      method: "GET",
      pattern: /^\/v1\/keys(?:\/([0-9a-f]+))?$/u,
      endpoint: "keys",
      handle: (_body, id) => {
        const keyset = id === "" ? activeKeyset() : knownKeyset(id)
        return {
          keysets: [
            {
              id: keyset.keysetId,
              unit: "sat",
              active: keyset === activeKeyset(),
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
        if (total !== quote.amount) throw versionedError("unbalanced")
        const signatures = signAll(outputs)
        setMintQuoteState(quote, "ISSUED")
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
          throw versionedError("unbalanced")
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
            state: spentYs.has(y)
              ? "SPENT"
              : pendingYs.has(y)
                ? "PENDING"
                : "UNSPENT",
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
        if (options.supportsNut09 === false)
          throw new FakeMintHttpError(404, { detail: "not found" })
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
          // A reserve of none, as a mint paying an invoice of its own asks.
          feeReserve:
            meltFeeReservePercent === 0
              ? 0
              : Math.max(2, Math.ceil((amount * meltFeeReservePercent) / 100)),
          expiry:
            options.meltQuotesExpire === false
              ? 0
              : Math.floor(now() / 1000) + 600,
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
        // An expired quote is never paid: a melt request that reaches the
        // mint late is refused, which an UNPAID past expiry relies on.
        if (quote.expiry !== 0 && now() > quote.expiry * 1000)
          throw mintError(20007, "quote expired")
        const inputs = parseInputs(body.inputs)
        const inputTotal = verifyInputs(inputs)
        const needed = quote.amount + quote.feeReserve + inputFee(inputs.length)
        if (inputTotal < needed) throw versionedError("unbalanced")
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
    const param = decodeURIComponent(route.pattern.exec(path)?.[1] ?? "")
    if (failure?.type === "deferred") {
      const quote =
        failure.answer !== undefined && route.endpoint === "melt"
          ? meltQuotes.get(String(body.quote))
          : undefined
      const paying =
        quote === undefined
          ? null
          : {
              quote,
              ys: parseInputs(body.inputs).map((input) => yOf(input.secret)),
            }
      if (paying !== null) {
        paying.quote.state = "PENDING"
        for (const y of paying.ys) pendingYs.add(y)
      }
      deferredSequence += 1
      deferred.set(deferredSequence, {
        endpoint: route.endpoint,
        handle: () => route.handle(body, param),
        release: () => {
          if (paying === null) return
          if (paying.quote.state === "PENDING") paying.quote.state = "UNPAID"
          for (const y of paying.ys) pendingYs.delete(y)
        },
      })
      if (failure.answer !== undefined)
        return respond(400, {
          code: failure.answer.code,
          detail: failure.answer.detail,
        })
      throw new TypeError("Failed to fetch (request held by the mint)")
    }
    try {
      const result = route.handle(body, param)
      if (failure?.type === "then") await failure.run()
      if (failure?.type === "lostResponse")
        throw new TypeError("Failed to fetch (response lost)")
      if (failure?.type === "garbledResponse")
        return new Response("{", {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      return respond(200, result)
    } catch (error) {
      if (error instanceof FakeMintHttpError)
        return respond(error.status, error.body)
      throw error
    }
  }

  return {
    url: options.url,
    /** The active keyset's id. */
    get keysetId() {
      return activeKeyset().keysetId
    },
    /**
     * A new keyset becomes the active one: the old one still verifies its
     * proofs and restores what it signed, but signs no new outputs (12002).
     */
    rotateKeyset: () => {
      keysets.push(
        createKeyset(
          sha256(
            new TextEncoder().encode(
              `${bytesToHex(keySeed)}:rotation:${keysets.length}`
            )
          )
        )
      )
    },
    handles,
    fetch: fetchFake,
    /** The customer paid the quote's invoice. */
    payMintQuote: (quoteId: string) => {
      const quote = findMintQuote(quoteId)
      if (quote.state === "UNPAID") setMintQuoteState(quote, "PAID")
    },
    mintQuoteState: (quoteId: string) => mintQuotes.get(quoteId)?.state ?? null,
    /** Someone paid this invoice, if it is one of this mint's quotes. */
    payInvoice: (invoice: string) => {
      for (const quote of mintQuotes.values())
        if (quote.request === invoice && quote.state === "UNPAID")
          setMintQuoteState(quote, "PAID")
    },
    mintQuoteIds: () => [...mintQuotes.keys()],
    pushesMintQuotes: options.supportsNut17 === true,
    /** How many NUT-17 subscriptions to mint quotes are open. */
    mintQuoteSubscriptionCount: () => mintQuoteListeners.size,
    /** How many NUT-17 sockets are open at the mint. */
    webSocketCount: () => openSockets.size,
    /** How many NUT-17 sockets were asked for, opened or not. */
    webSocketAttempts: () => sockets.attempts,
    /**
     * From now on a socket asked for never opens nor closes, as behind a
     * proxy that drops the upgrade.
     */
    hangWebSockets: (): void => {
      sockets.hang = true
    },
    /**
     * A socket asked for, opened or closed at the mint, as
     * `createFakeMintsWebSocket` reports it; whether it opens.
     */
    trackWebSocket: (
      socket: object,
      event: "asked" | "opened" | "closed"
    ): boolean => {
      if (event === "asked") sockets.attempts += 1
      if (event === "opened") openSockets.add(socket)
      if (event === "closed") openSockets.delete(socket)
      return !sockets.hang
    },
    /**
     * NUT-17: `push` hears each quote's state now and every state it takes
     * later, until the returned function unsubscribes.
     */
    subscribeMintQuotes: (
      quoteIds: ReadonlyArray<string>,
      push: (quote: unknown) => void
    ): (() => void) => {
      const listener = (quote: MintQuote) => {
        if (quoteIds.includes(quote.quote)) push(mintQuoteJson(quote))
      }
      for (const id of quoteIds) {
        const quote = mintQuotes.get(id)
        if (quote !== undefined) listener(quote)
      }
      mintQuoteListeners.add(listener)
      return () => {
        mintQuoteListeners.delete(listener)
      }
    },
    /**
     * Melt quotes from now on reserve this percent for Lightning fees, at
     * least 2 sat; 0 reserves nothing, so a melt asks for no change.
     */
    setMeltFeeReservePercent: (percent: number) => {
      meltFeeReservePercent = percent
    },
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
    /** Forgets every failure queued and not hit yet; held requests stay. */
    clearFailures: () => {
      pendingFailures.clear()
    },
    /** The requests a `deferred` failure holds, oldest first. */
    deferredRequests: (): ReadonlyArray<{
      readonly id: number
      readonly endpoint: FakeMintEndpoint
    }> => [...deferred].map(([id, { endpoint }]) => ({ id, endpoint })),
    /**
     * The held request reaches the mint now and is handled as it would have
     * been; its answer goes nowhere, the caller long gone. Returns whether the
     * mint did the work or refused it, with the NUT error it refused with.
     */
    deliverDeferred: (
      id: number
    ):
      | { readonly ok: true }
      | { readonly ok: false; readonly error: unknown } => {
      const request = deferred.get(id)
      if (request === undefined) throw new Error(`no deferred request ${id}`)
      deferred.delete(id)
      request.release()
      try {
        request.handle()
        return { ok: true }
      } catch (error) {
        if (error instanceof FakeMintHttpError)
          return { ok: false, error: error.body }
        throw error
      }
    },
    /** The held request never reaches the mint. */
    dropDeferred: (id: number): void => {
      const request = deferred.get(id)
      if (request === undefined) throw new Error(`no deferred request ${id}`)
      deferred.delete(id)
      request.release()
    },
    isSpent: (secret: string) => spentYs.has(yOf(secret)),
    signedCount: () => signed.size,
    requestCount: (endpoint: FakeMintEndpoint) => counts.get(endpoint) ?? 0,
    /** The private key of one denomination, for tests that forge proofs. */
    hexPrivateKey: (amount: number) =>
      bytesToHex(privateKeyFor(activeKeyset(), amount)),
    publicKey: (amount: number) =>
      bytesToHex(activeKeyset().pubKeys[String(amount)] ?? hexToBytes("")),
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

interface FakeSocketEvent {
  readonly code?: number
  readonly reason?: string
  readonly wasClean?: boolean
  readonly data?: string
}

/** A JSON-RPC request cashu-ts sends over a NUT-17 socket. */
const FakeSocketRequestJson = jsonCodec(
  z.object({
    method: z.string(),
    id: z.number(),
    params: z.object({
      kind: z.string().optional(),
      subId: z.string(),
      filters: z.array(z.string()).optional(),
    }),
  })
)

/**
 * A `WebSocket` over several fake mints' NUT-17 endpoint, the one cashu-ts
 * opens at `<mint>/v1/ws`: `bolt11_mint_quote` subscriptions, each answered
 * with its quotes' states now and with every state they take later. A mint
 * that does not push refuses the connection. Messages arrive on later tasks,
 * as a socket's do.
 */
export const createFakeMintsWebSocket = (mints: ReadonlyArray<FakeCashuMint>) =>
  class FakeMintWebSocket {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSING = 2
    static readonly CLOSED = 3

    readyState = FakeMintWebSocket.CONNECTING
    onopen: ((event: FakeSocketEvent) => void) | null = null
    onmessage: ((event: FakeSocketEvent) => void) | null = null
    onclose: ((event: FakeSocketEvent) => void) | null = null
    onerror: ((event: FakeSocketEvent) => void) | null = null

    readonly #mint: FakeCashuMint | undefined
    readonly #subscriptions = new Map<string, () => void>()

    constructor(url: string | URL) {
      const httpUrl = String(url).replace(/^ws/u, "http")
      this.#mint = mints.find(
        (candidate) => candidate.pushesMintQuotes && candidate.handles(httpUrl)
      )
      if (this.#mint?.trackWebSocket(this, "asked") === false) return
      setTimeout(() => {
        if (this.#mint === undefined) {
          this.readyState = FakeMintWebSocket.CLOSED
          this.onerror?.({})
          this.onclose?.({ code: 1006, reason: "", wasClean: false })
          return
        }
        this.readyState = FakeMintWebSocket.OPEN
        this.#mint.trackWebSocket(this, "opened")
        this.onopen?.({})
      }, 0)
    }

    send(text: string): void {
      const decoded = z.safeDecode(FakeSocketRequestJson, text)
      // A real mint answers a malformed request with an error; nothing a
      // test needs.
      if (!decoded.success) return
      const message = decoded.data
      const { subId } = message.params
      this.#emit({
        jsonrpc: "2.0",
        result: { status: "OK", subId },
        id: message.id,
      })
      if (message.method === "unsubscribe") {
        this.#subscriptions.get(subId)?.()
        this.#subscriptions.delete(subId)
        return
      }
      if (message.params.kind !== "bolt11_mint_quote") return
      const unsubscribe = this.#mint?.subscribeMintQuotes(
        message.params.filters ?? [],
        (payload) =>
          this.#emit({
            jsonrpc: "2.0",
            method: "subscribe",
            params: { subId, payload },
          })
      )
      if (unsubscribe !== undefined) this.#subscriptions.set(subId, unsubscribe)
    }

    close(): void {
      if (this.readyState === FakeMintWebSocket.CLOSED) return
      for (const unsubscribe of this.#subscriptions.values()) unsubscribe()
      this.#subscriptions.clear()
      this.readyState = FakeMintWebSocket.CLOSED
      this.#mint?.trackWebSocket(this, "closed")
      this.onclose?.({ code: 1000, reason: "", wasClean: true })
    }

    #emit(message: unknown): void {
      setTimeout(() => {
        if (this.readyState === FakeMintWebSocket.OPEN)
          this.onmessage?.({ data: JSON.stringify(message) })
      }, 0)
    }
  }
