import { createIdFromString, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createInProcessLockManager } from "@/core/cli/in-process-lock-manager.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import { createAccount } from "@/core/modules/account/account-actions.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/evolu-utils.ts"
import { SparkSecret } from "@/core/modules/shared/key-derivation.ts"
import { createTestInvoice } from "@/core/modules/shared/lightning-invoice-test-fixtures.ts"
import {
  BitcoinAddress,
  NonEmptyString255,
  NonEmptyStringSchema,
  PositiveInteger,
} from "@/core/modules/shared/schema.ts"
import type {
  SparkPaymentWallet,
  SparkWithdrawalFeeQuote,
  SparkWithdrawalStatus,
} from "@/core/spark/spark-wallet.ts"
import { createFakeSparkWallet } from "@/core/spark/spark-wallet-test-fixtures.ts"
import { createTestDateDep, testFixedDate } from "@/test/date-dep.ts"
import { createEvoluTest } from "@/test/evolu.ts"
import { evoluTestDeps } from "@/test/evolu-deps.ts"
import {
  confirmOnchainWithdrawalSent,
  executeWithdrawal,
  type LightningWithdrawalQuote,
  markWithdrawalFailed,
  type OnchainWithdrawalQuote,
  quoteWithdrawal,
  type SupportedWithdrawDestination,
} from "./withdraw-actions.ts"
import { parseWithdrawDestination } from "./withdraw-destination-utils.ts"
import { toWithdrawalView, withdrawalDetailQuery } from "./withdraw-queries.ts"
import type { WithdrawalId } from "./withdraw-types.ts"

const validAddress = BitcoinAddress(
  "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"
)
const ownIdentity = `03${"cd".repeat(32)}`
const otherIdentity = `02${"ab".repeat(32)}`
const nowSeconds = testFixedDate.getTime() / 1000
const transferId = "0192f7a4-0000-7000-8000-000000000001"

const feeQuote: SparkWithdrawalFeeQuote = {
  id: "fee-quote-1",
  expiresAt: "2026-06-05T12:05:00.000Z",
  fast: { userFeeSats: 300, l1BroadcastFeeSats: 500, totalFeeSats: 800 },
  medium: { userFeeSats: 200, l1BroadcastFeeSats: 300, totalFeeSats: 500 },
  slow: { userFeeSats: 100, l1BroadcastFeeSats: 150, totalFeeSats: 250 },
}

const setUp = async (wallet: Partial<SparkPaymentWallet>) => {
  const testEvolu = await createEvoluTest()
  const { evolu } = testEvolu
  const deps = {
    ...evoluTestDeps(evolu),
    lockManager: createInProcessLockManager(),
    fetch: async (): Promise<Response> => {
      throw new Error("unexpected fetch")
    },
    ...createTestDateDep(),
    sparkWallet: {
      create: async () =>
        createFakeSparkWallet({
          getIdentityPublicKey: async () => ownIdentity,
          ...wallet,
        }),
    },
  }
  await using run = testCreateRun(deps)
  const accountId = await run.ok(
    createAccount({
      deviceId: null,
      name: NonEmptyString255("Spark wallet"),
      spark: { secret: SparkSecret("42373a7543db65ae0228ead6c9cbffcc") },
    })
  )
  return { testEvolu, evolu, deps, accountId }
}

const destination = (raw: string): SupportedWithdrawDestination => {
  const parsed = parseWithdrawDestination(raw)
  if (!parsed.ok || parsed.value.kind === "unsupported") {
    throw new Error(`Not a supported destination: ${raw}`)
  }
  return parsed.value
}

const validInvoice = (hrp = "lnbc10u", identity?: string) =>
  createTestInvoice({
    hrp,
    timestamp: nowSeconds,
    expirySeconds: 3600,
    sparkFallback:
      identity === undefined
        ? undefined
        : { via: "fallback-address", identity },
  })

const withdrawalsQuery = (accountId: AccountId) =>
  createQuery((db) =>
    db
      .selectFrom("withdrawal")
      .leftJoin("withdrawalOnchain", "withdrawalOnchain.id", "withdrawal.id")
      .leftJoin(
        "withdrawalLightning",
        "withdrawalLightning.id",
        "withdrawal.id"
      )
      .select([
        "withdrawal.id",
        "withdrawal.deviceId",
        "withdrawal.amountSats",
        "withdrawal.accountTransactionId",
        "withdrawal.failedAt",
        "withdrawal.failureReason",
        "withdrawalOnchain.feeSats",
        "withdrawalOnchain.exitSpeed",
        "withdrawalLightning.sparkTransferId",
        "withdrawalLightning.maxFeeSats",
        "withdrawalLightning.lightningAddress",
      ])
      .where("withdrawal.accountId", "=", accountId)
  )

const movementsQuery = (accountId: AccountId) =>
  createQuery((db) =>
    db
      .selectFrom("accountTransaction")
      .leftJoin(
        "accountTransactionOnchain",
        "accountTransactionOnchain.id",
        "accountTransaction.id"
      )
      .leftJoin(
        "accountTransactionSource",
        "accountTransactionSource.accountTransactionId",
        "accountTransaction.id"
      )
      .select([
        "accountTransaction.id",
        "accountTransaction.amount",
        "accountTransaction.kind",
        "accountTransactionOnchain.coopExitRequestId",
        "accountTransactionOnchain.feeSats",
        "accountTransactionOnchain.txid",
        "accountTransactionSource.source",
        "accountTransactionSource.deviceId",
      ])
      .where("accountTransaction.accountId", "=", accountId)
  )

const onchainQuote = (
  overrides: Partial<OnchainWithdrawalQuote> = {}
): OnchainWithdrawalQuote => ({
  kind: "onchain",
  onchainAddress: validAddress,
  availableSats: 100_000,
  amountSats: 10_000,
  withdrawAll: false,
  feeQuote,
  ...overrides,
})

const lightningQuote = (
  overrides: Partial<LightningWithdrawalQuote> = {}
): LightningWithdrawalQuote => {
  const parsed = destination(validInvoice())
  if (parsed.kind !== "lightning-invoice") throw new Error("not an invoice")
  return {
    kind: "lightning",
    availableSats: 100_000,
    invoice: parsed,
    lightningAddress: null,
    recipientText: null,
    amountSats: 1000,
    amountSatsToSend: undefined,
    withdrawAll: false,
    maxFeeSats: 13,
    transferId,
    ...overrides,
  }
}

const deviceId = createIdFromString<"Device">("withdrawal-test-device")

describe("quoteWithdrawal", () => {
  test("prices an on-chain amount", async () => {
    const { testEvolu, deps, accountId } = await setUp({
      getBalance: async () => ({ availableSats: 100_000 }),
      getWithdrawalFeeQuote: async () => feeQuote,
    })
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    expect(
      await run(
        quoteWithdrawal({
          accountId,
          destination: destination(validAddress),
          amountSats: PositiveInteger(10_000),
        })
      )
    ).toMatchObject({
      ok: true,
      value: {
        kind: "onchain",
        availableSats: 100_000,
        amountSats: 10_000,
        withdrawAll: false,
        feeQuote,
      },
    })
  })

  test("prices an on-chain withdraw-all against the balance", async () => {
    const { testEvolu, deps, accountId } = await setUp({
      getBalance: async () => ({ availableSats: 50_000 }),
      getWithdrawalFeeQuote: async () => feeQuote,
    })
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    expect(
      await run(
        quoteWithdrawal({ accountId, destination: destination(validAddress) })
      )
    ).toMatchObject({
      ok: true,
      value: { amountSats: 50_000, withdrawAll: true },
    })
  })

  test("refuses an on-chain withdraw-all the fee would eat", async () => {
    const { testEvolu, deps, accountId } = await setUp({
      getBalance: async () => ({ availableSats: 250 }),
      getWithdrawalFeeQuote: async () => feeQuote,
    })
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    expect(
      await run(
        quoteWithdrawal({ accountId, destination: destination(validAddress) })
      )
    ).toMatchObject({
      ok: false,
      error: { type: "InsufficientWithdrawalBalance" },
    })
  })

  test("refuses an on-chain amount below the minimum before asking for a fee quote", async () => {
    const { testEvolu, deps, accountId } = await setUp({})
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    expect(
      await run(
        quoteWithdrawal({
          accountId,
          destination: destination(validAddress),
          amountSats: PositiveInteger(9_999),
        })
      )
    ).toEqual({
      ok: false,
      error: { type: "WithdrawalBelowMinimum", minSats: 10_000 },
    })
  })

  test("refuses an on-chain withdraw-all that would leave the recipient less than the minimum", async () => {
    const { testEvolu, deps, accountId } = await setUp({
      getBalance: async () => ({ availableSats: 10_100 }),
      getWithdrawalFeeQuote: async () => feeQuote,
    })
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    expect(
      await run(
        quoteWithdrawal({ accountId, destination: destination(validAddress) })
      )
    ).toMatchObject({
      ok: false,
      error: { type: "WithdrawalBelowMinimum" },
    })
  })

  test("refuses an on-chain amount above the balance", async () => {
    const { testEvolu, deps, accountId } = await setUp({
      getBalance: async () => ({ availableSats: 5_000 }),
    })
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    expect(
      await run(
        quoteWithdrawal({
          accountId,
          destination: destination(validAddress),
          amountSats: PositiveInteger(10_000),
        })
      )
    ).toMatchObject({
      ok: false,
      error: {
        type: "InsufficientWithdrawalBalance",
        availableSats: 5_000,
        requestedSats: 10_000,
      },
    })
  })

  test("fails when the account does not exist", async () => {
    const { testEvolu, deps } = await setUp({})
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    expect(
      await run(
        quoteWithdrawal({
          accountId: createIdFromString<"Account">("missing"),
          destination: destination(validAddress),
        })
      )
    ).toMatchObject({
      ok: false,
      error: { type: "WithdrawalAccountNotFound" },
    })
  })

  test("prices an invoice with an amount at the estimate plus the reserve", async () => {
    const estimates: Array<number | undefined> = []
    const { testEvolu, deps, accountId } = await setUp({
      getBalance: async () => ({ availableSats: 100_000 }),
      getLightningSendFeeEstimate: async ({ amountSats }) => {
        estimates.push(amountSats)
        return 10
      },
    })
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    const result = await run(
      quoteWithdrawal({ accountId, destination: destination(validInvoice()) })
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        kind: "lightning",
        amountSats: 1000,
        amountSatsToSend: undefined,
        withdrawAll: false,
        maxFeeSats: 13,
      },
    })
    expect(estimates).toEqual([undefined])
  })

  test("prices an invoice with a Spark fallback with the Lightning estimate too", async () => {
    const { testEvolu, deps, accountId } = await setUp({
      getBalance: async () => ({ availableSats: 100_000 }),
      getLightningSendFeeEstimate: async () => 10,
    })
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    expect(
      await run(
        quoteWithdrawal({
          accountId,
          destination: destination(validInvoice("lnbc10u", otherIdentity)),
        })
      )
    ).toMatchObject({ ok: true, value: { maxFeeSats: 13 } })
  })

  test("refuses an invoice whose amount and fee reserve exceed the balance", async () => {
    const { testEvolu, deps, accountId } = await setUp({
      getBalance: async () => ({ availableSats: 1005 }),
      getLightningSendFeeEstimate: async () => 10,
    })
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    expect(
      await run(
        quoteWithdrawal({ accountId, destination: destination(validInvoice()) })
      )
    ).toMatchObject({
      ok: false,
      error: {
        type: "InsufficientWithdrawalBalance",
        requestedSats: 1013,
        maxSendableSats: 992,
      },
    })
  })

  test("withdraws all to an amountless invoice as the balance minus the most the fee can be", async () => {
    const { testEvolu, deps, accountId } = await setUp({
      getBalance: async () => ({ availableSats: 50_000 }),
      getLightningSendFeeEstimate: async ({ amountSats }) =>
        amountSats === 50_000 ? 100 : -1,
    })
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    expect(
      await run(
        quoteWithdrawal({
          accountId,
          destination: destination(validInvoice("lnbc")),
        })
      )
    ).toMatchObject({
      ok: true,
      value: {
        amountSats: 49_890,
        amountSatsToSend: 49_890,
        withdrawAll: true,
        maxFeeSats: 110,
      },
    })
  })

  test("refuses an invoice about to expire", async () => {
    const { testEvolu, deps, accountId } = await setUp({})
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    expect(
      await run(
        quoteWithdrawal({
          accountId,
          destination: destination(
            createTestInvoice({
              hrp: "lnbc10u",
              timestamp: nowSeconds - 3600 + 30,
              expirySeconds: 3600,
            })
          ),
        })
      )
    ).toMatchObject({ ok: false, error: { type: "LightningInvoiceExpired" } })
  })

  test("refuses an invoice whose Spark fallback is this wallet", async () => {
    const { testEvolu, deps, accountId } = await setUp({
      getBalance: async () => ({ availableSats: 100_000 }),
      getLightningSendFeeEstimate: async () => 10,
    })
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    expect(
      await run(
        quoteWithdrawal({
          accountId,
          destination: destination(validInvoice("lnbc10u", ownIdentity)),
        })
      )
    ).toMatchObject({ ok: false, error: { type: "SelfWithdrawal" } })
  })

  test("refuses one of our own payment invoices", async () => {
    const { testEvolu, evolu, deps, accountId } = await setUp({
      getBalance: async () => ({ availableSats: 100_000 }),
      getLightningSendFeeEstimate: async () => 10,
    })
    await using _ = testEvolu
    const invoice = validInvoice()
    await runMutationWithCompletion((options) =>
      evolu.upsert(
        "paymentBtcLightning",
        {
          id: createIdFromString<"Payment">("own-payment"),
          lnInvoice: NonEmptyStringSchema.decode(invoice),
          lightningReceiveRequestId: null,
          paymentHash: null,
          paymentPreimage: null,
        },
        { ...options, ownerId: evolu.appOwner.id }
      )
    )
    await using run = testCreateRun(deps)

    expect(
      await run(
        quoteWithdrawal({ accountId, destination: destination(invoice) })
      )
    ).toMatchObject({ ok: false, error: { type: "SelfWithdrawal" } })
  })

  test("prices a Lightning address from the invoice it returns", async () => {
    const pr = validInvoice("lnbc10u")
    const requested: string[] = []
    const { testEvolu, deps, accountId } = await setUp({
      getBalance: async () => ({ availableSats: 100_000 }),
      getLightningSendFeeEstimate: async () => 10,
    })
    await using _ = testEvolu
    await using run = testCreateRun({
      ...deps,
      fetch: async (input: RequestInfo | URL) => {
        const url = String(input)
        requested.push(url)
        return url.includes("/.well-known/lnurlp/")
          ? Response.json({
              tag: "payRequest",
              callback: "https://example.com/cb",
              minSendable: 1_000,
              maxSendable: 10_000_000,
              metadata: '[["text/plain","Pay Alice"]]',
            })
          : Response.json({ pr, routes: [] })
      },
    })

    expect(
      await run(
        quoteWithdrawal({
          accountId,
          destination: destination("alice@example.com"),
          amountSats: PositiveInteger(1000),
        })
      )
    ).toMatchObject({
      ok: true,
      value: {
        kind: "lightning",
        lightningAddress: "alice@example.com",
        recipientText: "Pay Alice",
        amountSats: 1000,
        withdrawAll: false,
        maxFeeSats: 13,
      },
    })
    expect(requested).toEqual([
      "https://example.com/.well-known/lnurlp/alice",
      "https://example.com/cb?amount=1000000",
    ])
  })

  test("refuses a Lightning address amount outside its range", async () => {
    const { testEvolu, deps, accountId } = await setUp({})
    await using _ = testEvolu
    await using run = testCreateRun({
      ...deps,
      fetch: async () =>
        Response.json({
          tag: "payRequest",
          callback: "https://example.com/cb",
          minSendable: 10_000,
          maxSendable: 100_000,
          metadata: "[]",
        }),
    })

    expect(
      await run(
        quoteWithdrawal({
          accountId,
          destination: destination("alice@example.com"),
          amountSats: PositiveInteger(1000),
        })
      )
    ).toMatchObject({
      ok: false,
      error: { type: "WithdrawalAmountOutOfRange", minSats: 10, maxSats: 100 },
    })
  })
})

describe("executeWithdrawal", () => {
  test("records an on-chain withdrawal and its movement under the id it named up front", async () => {
    const { testEvolu, evolu, deps, accountId } = await setUp({
      withdraw: async () => ({
        kind: "sent",
        id: "coop-exit-1",
        status: "INITIATED" as SparkWithdrawalStatus,
        txid: "txid-1",
      }),
    })
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    const result = await run(
      executeWithdrawal({
        accountId,
        quote: onchainQuote(),
        exitSpeed: "medium",
        deviceId,
      })
    )

    expect(result.ok).toBe(true)
    const [withdrawal] = await evolu.loadQuery(withdrawalsQuery(accountId))
    expect(withdrawal).toMatchObject({
      deviceId,
      amountSats: 10_000,
      feeSats: 500,
      exitSpeed: "medium",
      failedAt: null,
    })
    expect(await evolu.loadQuery(movementsQuery(accountId))).toEqual([
      {
        id: withdrawal?.accountTransactionId,
        amount: -10_500,
        kind: "onchain",
        coopExitRequestId: "coop-exit-1",
        feeSats: 500,
        txid: "txid-1",
        source: "manual",
        deviceId,
      },
    ])
  })

  test("records what the recipient gets of an on-chain withdraw-all", async () => {
    const calls: unknown[] = []
    const { testEvolu, evolu, deps, accountId } = await setUp({
      withdraw: async (params) => {
        calls.push(params)
        return {
          kind: "sent",
          id: "coop-exit-2",
          status: "INITIATED" as SparkWithdrawalStatus,
          txid: null,
        }
      },
    })
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    await run(
      executeWithdrawal({
        accountId,
        quote: onchainQuote({
          amountSats: 50_000,
          availableSats: 50_000,
          withdrawAll: true,
        }),
        exitSpeed: "fast",
        deviceId,
      })
    )

    // The quoted balance, not whatever the balance is by the time it sends:
    // that is what the rows below record.
    expect(calls).toMatchObject([
      { amountSats: 50_000, deductFeeFromWithdrawalAmount: true },
    ])
    expect(await evolu.loadQuery(withdrawalsQuery(accountId))).toMatchObject([
      { amountSats: 49_200, feeSats: 800 },
    ])
    expect(await evolu.loadQuery(movementsQuery(accountId))).toMatchObject([
      { amount: -50_000, feeSats: 800 },
    ])
  })

  test("leaves a rejected on-chain withdrawal uncertain", async () => {
    const { testEvolu, evolu, deps, accountId } = await setUp({
      withdraw: async () => ({ kind: "rejected", message: "nope" }),
    })
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    const result = await run(
      executeWithdrawal({
        accountId,
        quote: onchainQuote(),
        exitSpeed: "medium",
        deviceId,
      })
    )

    expect(result).toMatchObject({
      ok: false,
      error: { type: "WithdrawalOutcomeUnknown" },
    })
    expect(await evolu.loadQuery(withdrawalsQuery(accountId))).toMatchObject([
      { failedAt: null },
    ])
    expect(await evolu.loadQuery(movementsQuery(accountId))).toEqual([])
  })

  test("reports a throwing on-chain send as an unknown outcome", async () => {
    const { testEvolu, evolu, deps, accountId } = await setUp({
      withdraw: async () => {
        throw new Error("spark node unreachable")
      },
    })
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    const result = await run(
      executeWithdrawal({
        accountId,
        quote: onchainQuote(),
        exitSpeed: "medium",
        deviceId,
      })
    )

    expect(result).toMatchObject({
      ok: false,
      error: { type: "WithdrawalOutcomeUnknown" },
    })
    expect(await evolu.loadQuery(withdrawalsQuery(accountId))).toHaveLength(1)
  })

  test("refuses an on-chain fee quote about to expire before recording anything", async () => {
    const { testEvolu, evolu, deps, accountId } = await setUp({})
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    const result = await run(
      executeWithdrawal({
        accountId,
        quote: onchainQuote({
          feeQuote: { ...feeQuote, expiresAt: "2026-06-05T12:00:59.000Z" },
        }),
        exitSpeed: "medium",
        deviceId,
      })
    )

    expect(result).toEqual({
      ok: false,
      error: { type: "WithdrawalQuoteExpired" },
    })
    expect(await evolu.loadQuery(withdrawalsQuery(accountId))).toEqual([])
  })

  // The quote passed on the slow fee (10_250 left); the fast fee leaves 9_700.
  test("refuses an on-chain withdraw-all the chosen speed pushes under the minimum before recording anything", async () => {
    const calls: unknown[] = []
    const { testEvolu, evolu, deps, accountId } = await setUp({
      withdraw: async (params) => {
        calls.push(params)
        return { kind: "rejected", message: "below minimum" }
      },
    })
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    const result = await run(
      executeWithdrawal({
        accountId,
        quote: onchainQuote({
          amountSats: 10_500,
          availableSats: 10_500,
          withdrawAll: true,
        }),
        exitSpeed: "fast",
        deviceId,
      })
    )

    expect(result).toEqual({
      ok: false,
      error: { type: "WithdrawalBelowMinimum", minSats: 10_000 },
    })
    expect(calls).toEqual([])
    expect(await evolu.loadQuery(withdrawalsQuery(accountId))).toEqual([])
  })

  test("pays a Lightning invoice and leaves the movement to the sync job", async () => {
    const payments: unknown[] = []
    const { testEvolu, evolu, deps, accountId } = await setUp({
      payLightningInvoice: async (params) => {
        payments.push(params)
        return { kind: "sent" }
      },
    })
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    const result = await run(
      executeWithdrawal({
        accountId,
        quote: lightningQuote(),
        exitSpeed: "medium",
        deviceId,
      })
    )

    expect(result.ok).toBe(true)
    expect(payments).toMatchObject([{ maxFeeSats: 13, transferId }])
    expect(await evolu.loadQuery(withdrawalsQuery(accountId))).toMatchObject([
      {
        amountSats: 1000,
        accountTransactionId: createIdFromString(
          `accountTransaction:spark:${transferId}`
        ),
        sparkTransferId: transferId,
        maxFeeSats: 13,
        lightningAddress: null,
      },
    ])
    expect(await evolu.loadQuery(movementsQuery(accountId))).toEqual([])
  })

  test("holds the withdrawal's lock while sending", async () => {
    let lockFree: boolean | undefined
    const setup = await setUp({})
    const { testEvolu, evolu, deps, accountId } = setup
    await using _ = testEvolu
    await using run = testCreateRun({
      ...deps,
      sparkWallet: {
        create: async () =>
          createFakeSparkWallet({
            payLightningInvoice: async () => {
              const [withdrawal] = await evolu.loadQuery(
                withdrawalsQuery(accountId)
              )
              lockFree = await deps.lockManager.request(
                `withdrawal-${withdrawal?.id}`,
                { ifAvailable: true },
                (lock) => lock !== null
              )
              return { kind: "sent" }
            },
          }),
      },
    })

    await run(
      executeWithdrawal({
        accountId,
        quote: lightningQuote(),
        exitSpeed: "medium",
        deviceId,
      })
    )

    expect(lockFree).toBe(false)
  })

  test("marks a rejected Lightning payment failed once no transfer exists", async () => {
    const { testEvolu, evolu, deps, accountId } = await setUp({
      payLightningInvoice: async () => ({ kind: "rejected", message: "fee" }),
      getTransfer: async () => false,
    })
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    const result = await run(
      executeWithdrawal({
        accountId,
        quote: lightningQuote(),
        exitSpeed: "medium",
        deviceId,
      })
    )

    expect(result).toMatchObject({
      ok: false,
      error: { type: "WithdrawalRejected" },
    })
    expect(await evolu.loadQuery(withdrawalsQuery(accountId))).toMatchObject([
      { failedAt: testFixedDate.getTime(), failureReason: "rejected" },
    ])
  })

  test("leaves a rejected Lightning payment uncertain when its transfer exists", async () => {
    const { testEvolu, evolu, deps, accountId } = await setUp({
      payLightningInvoice: async () => ({ kind: "rejected", message: "fee" }),
      getTransfer: async () => true,
    })
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    const result = await run(
      executeWithdrawal({
        accountId,
        quote: lightningQuote(),
        exitSpeed: "medium",
        deviceId,
      })
    )

    expect(result).toMatchObject({
      ok: false,
      error: { type: "WithdrawalOutcomeUnknown" },
    })
    expect(await evolu.loadQuery(withdrawalsQuery(accountId))).toMatchObject([
      { failedAt: null, failureReason: null },
    ])
  })

  test("leaves a rejected Lightning payment uncertain when the transfer lookup fails", async () => {
    const { testEvolu, evolu, deps, accountId } = await setUp({
      payLightningInvoice: async () => ({ kind: "rejected", message: "fee" }),
      getTransfer: async () => {
        throw new Error("unavailable")
      },
    })
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    expect(
      await run(
        executeWithdrawal({
          accountId,
          quote: lightningQuote(),
          exitSpeed: "medium",
          deviceId,
        })
      )
    ).toMatchObject({
      ok: false,
      error: { type: "WithdrawalOutcomeUnknown" },
    })
    expect(await evolu.loadQuery(withdrawalsQuery(accountId))).toMatchObject([
      { failedAt: null },
    ])
  })

  test("refuses an invoice about to expire before recording anything", async () => {
    const { testEvolu, evolu, deps, accountId } = await setUp({})
    await using _ = testEvolu
    await using run = testCreateRun(deps)
    const quote = lightningQuote()

    expect(
      await run(
        executeWithdrawal({
          accountId,
          quote: {
            ...quote,
            invoice: {
              ...quote.invoice,
              expiresAt: testFixedDate.getTime() + 59_000,
            },
          },
          exitSpeed: "medium",
          deviceId,
        })
      )
    ).toEqual({ ok: false, error: { type: "LightningInvoiceExpired" } })
    expect(await evolu.loadQuery(withdrawalsQuery(accountId))).toEqual([])
  })
})

describe("on-chain resolution", () => {
  const recordUncertainWithdrawal = async () => {
    const setup = await setUp({
      withdraw: async () => ({ kind: "rejected", message: "nope" }),
    })
    await using run = testCreateRun(setup.deps)
    const result = await run(
      executeWithdrawal({
        accountId: setup.accountId,
        quote: onchainQuote(),
        exitSpeed: "medium",
        deviceId,
      })
    )
    if (result.ok || result.error.type !== "WithdrawalOutcomeUnknown") {
      throw new Error("expected an uncertain withdrawal")
    }
    return { ...setup, withdrawalId: result.error.withdrawalId }
  }

  const viewOf = async (
    evolu: EvoluDep["evolu"],
    withdrawalId: WithdrawalId
  ) => {
    const [row] = await evolu.loadQuery(withdrawalDetailQuery(withdrawalId))
    return row === undefined ? null : toWithdrawalView(row)
  }

  test("“the money left” records the movement with the amount and the quoted fee", async () => {
    const { testEvolu, evolu, deps, accountId, withdrawalId } =
      await recordUncertainWithdrawal()
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    await run(confirmOnchainWithdrawalSent({ withdrawalId, deviceId }))
    await run(confirmOnchainWithdrawalSent({ withdrawalId, deviceId }))

    expect(await evolu.loadQuery(movementsQuery(accountId))).toMatchObject([
      {
        amount: -10_500,
        coopExitRequestId: null,
        txid: null,
        feeSats: 500,
        source: "manual",
      },
    ])
    expect((await viewOf(evolu, withdrawalId))?.state.status).toBe("done")
  })

  test("a movement beats a manual failure", async () => {
    const { testEvolu, evolu, deps, withdrawalId } =
      await recordUncertainWithdrawal()
    await using _ = testEvolu
    await using run = testCreateRun(deps)

    await run(markWithdrawalFailed({ withdrawalId, reason: "manual" }))
    expect(await viewOf(evolu, withdrawalId)).toMatchObject({
      state: { status: "failed", reason: "manual" },
    })

    await run(confirmOnchainWithdrawalSent({ withdrawalId, deviceId }))
    expect((await viewOf(evolu, withdrawalId))?.state.status).toBe("done")
  })
})
