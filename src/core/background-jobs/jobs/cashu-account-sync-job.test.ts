import { createConsole, testCreateRun } from "@evolu/common"
import { PrivateDirectMessage } from "nostr-tools/kinds"
import { createRumor, createSeal, createWrap } from "nostr-tools/nip59"
import { generateSecretKey, getPublicKey } from "nostr-tools/pure"
import { describe, expect, test } from "vitest"

import type { CashuBackgroundJobContext } from "@/core/background-jobs/background-job-types.ts"
import { startCashuAccountSyncJob } from "@/core/background-jobs/jobs/cashu-account-sync-job.ts"
import { writeCashuDefaultMint } from "@/core/cashu/cashu-mints.ts"
import { createCashuWalletDep } from "@/core/cashu/cashu-wallet.ts"
import type { DeviceAccountId } from "@/core/evolu/device-client.ts"
import { createEetApiDep } from "@/core/integrations/eet/eet-client.ts"
import { createYadioApiDep } from "@/core/integrations/yadio/yadio-client.ts"
import { saveCashuAccount } from "@/core/modules/account/account-actions.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import { createPayment } from "@/core/modules/payment/payment-actions.ts"
import { prepareCashuPaymentMethod } from "@/core/modules/payment/payment-preparation-actions.ts"
import { paymentClaimsQuery } from "@/core/modules/payment/payment-queries.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import {
  CashuWalletSeed,
  deriveNostrSecretKey,
} from "@/core/modules/shared/key-derivation.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import {
  createCashuTest,
  testCashuMasterKey,
  testMintUrl,
} from "@/test/cashu.ts"
import { createFakeNostrDep } from "@/test/nostr.ts"

const setup = async () => {
  const t = await createCashuTest()
  const dateDep = { date: { now: () => new Date() } }
  const fetchDep = {
    fetch: async () =>
      new Response(
        JSON.stringify({ BTC: 1_500_000, timestamp: 1_700_000_000_000 })
      ),
  }
  const errors: unknown[] = []
  const relays = createFakeNostrDep()
  const deps: CashuBackgroundJobContext & ReturnType<typeof createYadioApiDep> =
    {
      ...t.deps,
      ...dateDep,
      ...fetchDep,
      ...createYadioApiDep(),
      ...createEetApiDep({ ...dateDep, ...fetchDep }),
      masterKey: testCashuMasterKey,
      nostr: relays.nostr,
      console: createConsole({ level: "silent" }),
      deviceId: "device" as DeviceId,
      connectivity: { onOnline: () => () => {} },
      onError: (error) => {
        errors.push(error)
      },
    }
  await using run = testCreateRun(deps)
  const accountId = await run.ok(saveCashuAccount({ enabled: true }))
  if (accountId === null) throw new Error("no Cashu account")
  await writeCashuDefaultMint(deps.cashuShardStore, testMintUrl)
  const paymentId = await run.orThrow(
    createPayment({
      deviceId: null,
      billId: null,
      tableId: null,
      amount: NonNegativeInteger(12_900),
      currency: "CZK",
      tipAmount: NonNegativeInteger(0),
      canceledAt: null,
      expiresAt: null,
    })
  )
  await run.orThrow(prepareCashuPaymentMethod({ paymentId, accountId }))
  return { t, deps, errors, relays, paymentId }
}

const waitForClaim = (deps: CashuBackgroundJobContext, paymentId: PaymentId) =>
  expect
    .poll(() => deps.evolu.loadQuery(paymentClaimsQuery(paymentId)), {
      timeout: 15_000,
      interval: 200,
    })
    .toHaveLength(1)

describe("cashu account sync job", () => {
  test("settles a paid Cashu payment: claims the quote, books the topup, claims the payment", async () => {
    const { t, deps, errors, paymentId } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)
    const job = await run.ok(startCashuAccountSyncJob)

    const [quoteId] = t.mint.mintQuoteIds()
    t.mint.payMintQuote(quoteId ?? "")

    await waitForClaim(deps, paymentId)
    expect(t.mint.mintQuoteState(quoteId ?? "")).toBe("ISSUED")
    await job[Symbol.asyncDispose]()
    expect(errors).toEqual([])
  }, 30_000)

  test("settles a payment paid with a NUT-18 token over NIP-17", async () => {
    const { t, deps, errors, relays, paymentId } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)
    const job = await run.ok(startCashuAccountSyncJob)

    // The customer's wallet sends the payment's 8 600 sat as a payload.
    const customerWallet = await createCashuWalletDep({
      seed: CashuWalletSeed(new Uint8Array(64).fill(9)),
      deviceAccountId: "customer" as DeviceAccountId,
      fetch: t.deps.fetch,
    }).cashuWallet.load(testMintUrl)
    const quote = await customerWallet.createMintQuoteBolt11(8_600)
    t.mint.payMintQuote(quote.quote)
    const proofs = await customerWallet.mintProofsBolt11(8_600, quote.quote)
    const customer = generateSecretKey()
    const payky = getPublicKey(deriveNostrSecretKey(testCashuMasterKey))
    const payload = JSON.stringify({
      id: paymentId,
      mint: testMintUrl,
      unit: "sat",
      proofs: proofs.map((proof) => ({
        id: proof.id,
        amount: Number(proof.amount),
        secret: proof.secret,
        C: proof.C,
      })),
    })
    relays.deliver(
      createWrap(
        createSeal(
          createRumor(
            {
              kind: PrivateDirectMessage,
              created_at: Math.floor(Date.now() / 1000),
              content: payload,
              tags: [["p", payky]],
            },
            customer
          ),
          customer,
          payky
        ),
        payky
      )
    )

    await waitForClaim(deps, paymentId)
    await job[Symbol.asyncDispose]()
    expect(errors).toEqual([])
  }, 30_000)
})
