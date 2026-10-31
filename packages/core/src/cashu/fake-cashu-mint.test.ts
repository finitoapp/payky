import { getEncodedToken } from "@cashu/cashu-ts"
import { describe, expect, test } from "vitest"
import { KeysetId, MintUrl } from "../modules/cashu/cashu-types.ts"
import {
  deriveCashuWalletSeed,
  MasterKey,
} from "../modules/shared/key-derivation.ts"
import {
  checkProofStates,
  createCashuWalletDep,
  type LoadedCashuWallet,
} from "./cashu-wallet.ts"
import { createFakeCashuMint } from "./fake-cashu-mint.ts"

const mintUrl = MintUrl("https://fake.mint.test")
const seed = deriveCashuWalletSeed(
  MasterKey("000102030405060708090a0b0c0d0e0f")
)

const setup = (inputFeePpk = 0) => {
  const mint = createFakeCashuMint({ url: mintUrl, inputFeePpk })
  const dep = createCashuWalletDep({
    seed,
    fetch: mint.fetch,
  })
  return { mint, dep }
}

const tokenOf = (proofs: Parameters<typeof getEncodedToken>[0]["proofs"]) =>
  getEncodedToken({ mint: mintUrl, proofs, unit: "sat" })

describe("fake cashu mint", () => {
  test("mints, swaps, checks state, restores and melts with a real cashu-ts wallet", async () => {
    const { mint, dep } = setup()
    const wallet = await dep.cashuWallet.load(mintUrl)
    const quote = await wallet.createMintQuoteBolt11(100)
    expect(quote.state).toBe("UNPAID")
    expect(quote.request.startsWith("lnbc")).toBe(true)
    mint.payMintQuote(quote.quote)
    expect((await wallet.checkMintQuoteBolt11(quote.quote)).state).toBe("PAID")

    const proofs = await wallet.mintProofsBolt11(100, quote.quote, undefined, {
      type: "deterministic",
      counter: 1,
    })
    expect(proofs.reduce((sum, p) => sum + Number(p.amount), 0)).toBe(100)
    expect(mint.mintQuoteState(quote.quote)).toBe("ISSUED")

    // Minting the same slots again collides.
    const again = await wallet.createMintQuoteBolt11(100)
    mint.payMintQuote(again.quote)
    await expect(
      wallet.mintProofsBolt11(100, again.quote, undefined, {
        type: "deterministic",
        counter: 1,
      })
    ).rejects.toMatchObject({ code: 11003 })

    const token = getEncodedToken({ mint: mintUrl, proofs, unit: "sat" })
    const received = await wallet.receive(token, undefined, {
      type: "deterministic",
      counter: 200,
    })
    expect(received.reduce((sum, p) => sum + Number(p.amount), 0)).toBe(100)
    const loaded: LoadedCashuWallet = {
      mint: mintUrl,
      wallet,
      keysetId: KeysetId(wallet.keysetId),
      supports: () => true,
    }
    const states = await checkProofStates(loaded, [...proofs, ...received])
    expect(states.ok && states.value).toEqual([
      ...proofs.map(() => "spent"),
      ...received.map(() => "unspent"),
    ])

    const restored = await wallet.restore(200, 64, {
      keysetId: wallet.keysetId,
    })
    expect(restored.proofs.map((p) => p.secret).sort()).toEqual(
      received.map((p) => p.secret).sort()
    )

    const meltQuote = await wallet.createMeltQuoteBolt11(
      "lnbc500n1pjfakeinvoice"
    )
    expect(Number(meltQuote.amount)).toBe(50)
    const melted = await wallet.meltProofsBolt11(
      meltQuote,
      received,
      undefined,
      {
        type: "deterministic",
        counter: 400,
      }
    )
    expect(melted.quote.state).toBe("PAID")
    expect(melted.change.reduce((sum, p) => sum + Number(p.amount), 0)).toBe(50)
  })

  test("an unreachable mint fails like a network error", async () => {
    const { mint, dep } = setup()
    mint.failNext("info", { type: "unreachable" })
    await expect(dep.cashuWallet.load(mintUrl)).rejects.toThrow()
    // The failed load is not cached.
    await expect(dep.cashuWallet.load(mintUrl)).resolves.toBeDefined()
  })

  test("a deferred request is answered as lost and handled only once it is delivered", async () => {
    const { mint, dep } = setup()
    const wallet = await dep.cashuWallet.load(mintUrl)
    const quote = await wallet.createMintQuoteBolt11(100)
    mint.payMintQuote(quote.quote)
    const proofs = await wallet.mintProofsBolt11(100, quote.quote, undefined, {
      type: "deterministic",
      counter: 0,
    })

    mint.failNext("swap", { type: "deferred" })
    await expect(
      wallet.receive(tokenOf(proofs), undefined, {
        type: "deterministic",
        counter: 64,
      })
    ).rejects.toThrow()
    const [held] = mint.deferredRequests()
    expect(held?.endpoint).toBe("swap")
    expect(proofs.every((proof) => !mint.isSpent(proof.secret))).toBe(true)

    expect(mint.deliverDeferred(held?.id ?? -1)).toEqual({ ok: true })
    expect(proofs.every((proof) => mint.isSpent(proof.secret))).toBe(true)
    expect(mint.deferredRequests()).toEqual([])
    const restored = await wallet.restore(64, 64, { keysetId: wallet.keysetId })
    expect(restored.proofs.reduce((sum, p) => sum + Number(p.amount), 0)).toBe(
      100
    )
  })

  test("a deferred request delivered after its inputs were spent is refused, and a dropped one never lands", async () => {
    const { mint, dep } = setup()
    const wallet = await dep.cashuWallet.load(mintUrl)
    const quote = await wallet.createMintQuoteBolt11(100)
    mint.payMintQuote(quote.quote)
    const proofs = await wallet.mintProofsBolt11(100, quote.quote, undefined, {
      type: "deterministic",
      counter: 0,
    })

    mint.failNext("swap", { type: "deferred" })
    mint.failNext("swap", { type: "deferred" })
    for (const counter of [64, 128])
      await expect(
        wallet.receive(tokenOf(proofs), undefined, {
          type: "deterministic",
          counter,
        })
      ).rejects.toThrow()
    const [late, dropped] = mint.deferredRequests()
    // A fence spends the inputs before either request lands.
    await wallet.receive(tokenOf(proofs), undefined, {
      type: "deterministic",
      counter: 192,
    })

    expect(mint.deliverDeferred(late?.id ?? -1)).toEqual({
      ok: false,
      error: { code: 11001, detail: "Token already spent." },
    })
    mint.dropDeferred(dropped?.id ?? -1)
    expect(mint.deferredRequests()).toEqual([])
    const restored = await wallet.restore(64, 128, {
      keysetId: wallet.keysetId,
    })
    expect(restored.proofs).toEqual([])
  })

  test("a melt request that reaches the mint after its quote expired is refused, nothing paid", async () => {
    let nowMs = 1_780_000_000_000
    const mint = createFakeCashuMint({ url: mintUrl, now: () => nowMs })
    const wallet = await createCashuWalletDep({
      seed,
      fetch: mint.fetch,
    }).cashuWallet.load(mintUrl)
    const quote = await wallet.createMintQuoteBolt11(100)
    mint.payMintQuote(quote.quote)
    const proofs = await wallet.mintProofsBolt11(100, quote.quote, undefined, {
      type: "deterministic",
      counter: 0,
    })
    const meltQuote = await wallet.createMeltQuoteBolt11(
      "lnbc500n1pjfakeinvoice"
    )

    nowMs += 601_000
    await expect(
      wallet.meltProofsBolt11(meltQuote, proofs, undefined, {
        type: "deterministic",
        counter: 64,
      })
    ).rejects.toMatchObject({ code: 20007 })
    expect(proofs.every((proof) => !mint.isSpent(proof.secret))).toBe(true)
  })
})
