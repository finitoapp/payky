import { sqliteFalse, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createQuery, type Evolu } from "../../evolu/schema.ts"
import { createYadioApiDep } from "../../integrations/yadio/yadio-client.ts"
import { createFakeSparkWallet } from "../../spark/spark-wallet-test-fixtures.ts"
import {
  createCashuTest,
  loadTestCashuOperations,
  testMintUrl,
} from "../../testing/cashu.ts"
import { saveCashuAccount } from "../account/account-actions.ts"
import { createCashuAccountId } from "../account/account-utils.ts"
import {
  setDefaultCashuMint,
  trustCashuMint,
} from "../cashu/cashu-mint-actions.ts"
import { cashuTrustedMintsQuery } from "../cashu/cashu-queries.ts"
import { MintUrl } from "../cashu/cashu-types.ts"
import { MAIN_MINT_URL, WEAKEST_DEFAULTED_AT } from "../cashu/cashu-utils.ts"
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import { NonEmptyString255, NonNegativeInteger } from "../shared/schema.ts"
import { createPayment } from "./payment-actions.ts"
import {
  prepareCashuPaymentMethod,
  preparePaymentMethod,
} from "./payment-preparation-actions.ts"
import { createPaymentAccounts } from "./payment-test-fixtures.ts"
import type { PaymentId } from "./payment-types.ts"

const otherMint = MintUrl("https://other.mint.test")

const setup = async ({
  seeded = true,
}: {
  /** False: an account enabled before the seed, with no mint chosen. */
  readonly seeded?: boolean
} = {}) => {
  const t = await createCashuTest({
    extraMints: [{ url: otherMint }, { url: MAIN_MINT_URL }],
    ...(seeded ? {} : { defaultMint: null }),
  })
  const deps = {
    ...t.deps,
    // Yadio: 1 BTC = 1 500 000 CZK, so 129 CZK is 8 600 sats.
    fetch: async () =>
      new Response(
        JSON.stringify({ BTC: 1_500_000, timestamp: 1_700_000_000_000 })
      ),
    ...createYadioApiDep(),
    sparkWallet: {
      create: async () =>
        createFakeSparkWallet({
          createLightningInvoice: async () => ({
            id: "lightning-request-1",
            invoice: {
              encodedInvoice: "lnbc8600n1spark",
              paymentHash: "payment-hash-1",
            },
            paymentPreimage: "payment-preimage-1",
            sparkInvoice: "spark-invoice-1",
          }),
        }),
    },
  }
  await using run = testCreateRun(deps)
  const cashuAccountId = seeded
    ? await run.ok(saveCashuAccount({ enabled: true }))
    : await writeUnseededCashuAccount(deps.evolu)
  if (cashuAccountId === null) throw new Error("no Cashu account")
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
  return { t, deps, cashuAccountId, paymentId }
}

/** The Cashu account alone, as a device holds it before its mints sync in. */
const writeUnseededCashuAccount = async (evolu: Evolu) => {
  const id = createCashuAccountId()
  await runMutationWithCompletion((options) => {
    evolu.upsert("accountCashu", { id }, options)
    evolu.upsert(
      "account",
      {
        id,
        deviceId: null,
        name: NonEmptyString255("Cashu"),
        kind: "cashu",
        isDeleted: sqliteFalse,
      },
      options
    )
  })
  return id
}

const paymentRowsQuery = (id: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .leftJoin("paymentCashu", "paymentCashu.id", "payment.id")
      .leftJoin("paymentBtc", "paymentBtc.id", "payment.id")
      .select([
        "payment.expiresAt",
        "paymentCashu.amountSats as cashuSats",
        "paymentCashu.mintUrl",
        "paymentCashu.quoteId",
        "paymentCashu.lnInvoice",
        "paymentCashu.quoteExpiresAt",
        "paymentCashu.receiveOperationId",
        "paymentBtc.amountSats as sparkSats",
        "paymentBtc.accountId as sparkAccountId",
      ])
      .where("payment.id", "=", id)
  )

describe("prepareCashuPaymentMethod", () => {
  test("quotes the payment mint, writes the topup, the paymentCashu row and the payment's expiry", async () => {
    const { t, deps, cashuAccountId, paymentId } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)

    const result = await run(
      prepareCashuPaymentMethod({ paymentId, accountId: cashuAccountId })
    )

    expect(result.ok).toBe(true)
    const [row] = await deps.evolu.loadQuery(paymentRowsQuery(paymentId))
    expect(row).toMatchObject({
      cashuSats: 8_600,
      mintUrl: testMintUrl,
      receiveOperationId: null,
    })
    expect(row?.lnInvoice?.startsWith("lnbc86000n")).toBe(true)
    expect(row?.expiresAt).toBe(row?.quoteExpiresAt)
    const [operation] = await loadTestCashuOperations(deps.evolu)
    expect(operation).toMatchObject({
      kind: "topup",
      status: "pending",
      mintUrl: testMintUrl,
      amount: 8_600,
    })
  })

  test("quotes at the default mint", async () => {
    const { t, deps, cashuAccountId, paymentId } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)
    await run.orThrow(trustCashuMint(otherMint))
    await run.orThrow(setDefaultCashuMint(otherMint))

    await run(
      prepareCashuPaymentMethod({ paymentId, accountId: cashuAccountId })
    )

    const [row] = await deps.evolu.loadQuery(paymentRowsQuery(paymentId))
    expect(row?.mintUrl).toBe(otherMint)
  })

  test("quotes at a fallback nobody chose and writes it as the weakest choice in the payment's batch", async () => {
    const { t, deps, cashuAccountId, paymentId } = await setup({
      seeded: false,
    })
    await using _ = t
    await using run = testCreateRun(deps)

    await run.orThrow(
      prepareCashuPaymentMethod({ paymentId, accountId: cashuAccountId })
    )

    const [row] = await deps.evolu.loadQuery(paymentRowsQuery(paymentId))
    expect(row?.mintUrl).toBe(MAIN_MINT_URL)
    expect(await deps.evolu.loadQuery(cashuTrustedMintsQuery)).toEqual([
      expect.objectContaining({
        mintUrl: MAIN_MINT_URL,
        defaultedAt: WEAKEST_DEFAULTED_AT,
      }),
    ])
  })

  test("leaves Spark's rows alone when both are prepared", async () => {
    const { t, deps, cashuAccountId, paymentId } = await setup()
    await using _ = t
    const { sparkAccountId } = await createPaymentAccounts(deps)
    await using run = testCreateRun(deps)
    await run.orThrow(
      preparePaymentMethod({ paymentId, spark: { accountId: sparkAccountId } })
    )
    const [before] = await deps.evolu.loadQuery(paymentRowsQuery(paymentId))

    await run.orThrow(
      prepareCashuPaymentMethod({ paymentId, accountId: cashuAccountId })
    )

    const [after] = await deps.evolu.loadQuery(paymentRowsQuery(paymentId))
    expect(after?.sparkSats).toBe(before?.sparkSats)
    expect(after?.sparkAccountId).toBe(sparkAccountId)
    expect(after?.cashuSats).toBe(8_600)
  })

  test("refuses a payment of nothing", async () => {
    const { t, deps, cashuAccountId } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)
    const zero = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(0),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
      })
    )
    const result = await run(
      prepareCashuPaymentMethod({ paymentId: zero, accountId: cashuAccountId })
    )
    expect(!result.ok && result.error.type).toBe("ZeroAmountNotPayable")
  })
})
