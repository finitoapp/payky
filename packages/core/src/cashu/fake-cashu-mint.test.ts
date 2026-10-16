import { getEncodedToken } from "@cashu/cashu-ts"
import { describe, expect, test } from "vitest"
import type { DeviceAccountId } from "../evolu/device-client.ts"
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
    deviceAccountId: "device" as DeviceAccountId,
    fetch: mint.fetch,
  })
  return { mint, dep }
}

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
})
