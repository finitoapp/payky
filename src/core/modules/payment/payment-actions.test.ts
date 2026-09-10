import {
  createIdFromString,
  evoluJsonObjectFrom,
  sqliteTrue,
  testCreateRun,
} from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { DateDep, EvoluOwnerIdDep, FetchDep } from "@/core/deps.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import {
  createYadioApiDep,
  type YadioApiDep,
} from "@/core/integrations/yadio/yadio-client.ts"
import { createAccount } from "@/core/modules/account/account-actions.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import {
  addCatalogItemToBill,
  addManualAmountToBill,
  addTipToBill,
  appendGuardedBillLines,
  appendRemoveBillLine,
  cancelBill,
  confirmBillClosedDespiteCancellation,
  createBill,
  loadBillCoverage,
  loadBillStatus,
  splitBill,
} from "@/core/modules/bill/bill-actions.ts"
import { billByIdQuery } from "@/core/modules/bill/bill-queries.ts"
import {
  insertBillLineRows,
  loadCalculatedBillLineSummaries,
} from "@/core/modules/bill-line/bill-line-actions.ts"
import { deriveBillLineSummaryDiff } from "@/core/modules/bill-line/bill-line-utils.ts"
import type { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import { upsertItemSnapshot } from "@/core/modules/item/item-actions.ts"
import { itemsByPaymentIdQuery } from "@/core/modules/item/item-queries.ts"
import { createStandaloneItemSnapshot } from "@/core/modules/item/item-utils.ts"
import { paymentLinesByPaymentIdQuery } from "@/core/modules/payment-line/payment-line-queries.ts"
import { paymentLinesToBillLineSummaries } from "@/core/modules/payment-line/payment-line-utils.ts"
import { claimManualReconciliation } from "@/core/modules/reconciliation-claim/reconciliation-claim-actions.ts"
import { activeReconciliationClaimsByPaymentIdQuery } from "@/core/modules/reconciliation-claim/reconciliation-claim-queries.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { SparkSecret } from "@/core/modules/shared/key-derivation.ts"
import {
  IbanSchema,
  Integer,
  NonEmptyString255,
  NonEmptyStringSchema,
  NonNegativeInteger,
  PositiveInteger,
  PositiveNumber,
  SpecificSymbol,
  TimestampMs,
  TimestampMsSchema,
  VariableSymbol,
} from "@/core/modules/shared/schema.ts"
import {
  createTableId,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import type { SparkWalletDep } from "@/core/spark/spark-wallet.ts"
import { createFakeSparkWallet } from "@/core/spark/spark-wallet-test-fixtures.ts"
import { createEvoluTest } from "../../evolu/cli-client"
import {
  acknowledgePaymentExcessSettlement,
  cancelPayment,
  confirmPaymentPaidDespiteCancellation,
  createPayment,
  createPreparedPayment,
  deletePayment,
  loadPayment,
  markPaymentPaidCash,
  markPaymentPaidIban,
  preparePaymentMethod,
  updatePayment,
} from "./payment-actions.ts"
import { paymentByIdQuery } from "./payment-queries.ts"
import { DEFAULT_LIGHTNING_INVOICE_EXPIRY_SECONDS } from "./payment-status-utils.ts"
import type { PaymentId } from "./payment-types.ts"

const fixedDate = new Date("2026-06-05T12:00:00.000Z")

const createDateDeps = (): DateDep => ({
  date: {
    now: () => fixedDate,
  },
})

const paymentWithDetailsByIdQuery = (id: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .select((eb) => [
        "payment.id",
        "payment.deviceId",
        "payment.billId",
        "payment.tableId",
        "payment.amount",
        "payment.currency",
        "payment.tipAmount",
        "payment.canceledAt",
        "payment.expiresAt",
        "payment.isDeleted",
        evoluJsonObjectFrom(
          eb
            .selectFrom("paymentCashRegister")
            .select([
              "paymentCashRegister.id",
              "paymentCashRegister.accountId",
              "paymentCashRegister.isDeleted",
            ])
            .whereRef("paymentCashRegister.id", "=", "payment.id")
        ).as("cashRegister"),
        evoluJsonObjectFrom(
          eb
            .selectFrom("paymentBtc")
            .leftJoin("paymentBtcLightning", (join) =>
              join
                .onRef("paymentBtcLightning.id", "=", "paymentBtc.id")
                .on("paymentBtcLightning.isDeleted", "is not", 1)
            )
            .leftJoin("paymentBtcSpark", (join) =>
              join
                .onRef("paymentBtcSpark.id", "=", "paymentBtc.id")
                .on("paymentBtcSpark.isDeleted", "is not", 1)
            )
            .select([
              "paymentBtc.id",
              "paymentBtc.accountId",
              "paymentBtc.amountSats",
              "paymentBtc.exchangeRate",
              "paymentBtc.exchangeRateSource",
              "paymentBtc.exchangeRateFetchedAt",
              "paymentBtcLightning.lnInvoice",
              "paymentBtcLightning.lightningReceiveRequestId",
              "paymentBtcLightning.paymentHash",
              "paymentBtcLightning.paymentPreimage",
              "paymentBtcSpark.sparkInvoice",
              "paymentBtc.isDeleted",
            ])
            .whereRef("paymentBtc.id", "=", "payment.id")
        ).as("spark"),
        evoluJsonObjectFrom(
          eb
            .selectFrom("paymentIban")
            .select([
              "paymentIban.id",
              "paymentIban.accountId",
              "paymentIban.variableSymbol",
              "paymentIban.specificSymbol",
              "paymentIban.isDeleted",
            ])
            .whereRef("paymentIban.id", "=", "payment.id")
        ).as("iban"),
      ])
      .where("payment.id", "=", id)
  )

const reconciliationClaimsByPaymentIdQuery = (id: PaymentId) =>
  createQuery((db) =>
    db.selectFrom("reconciliationClaim").selectAll().where("paymentId", "=", id)
  )

const accountTransactionsByPaymentIdQuery = (id: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("reconciliationClaim")
      .innerJoin(
        "accountTransaction",
        "accountTransaction.id",
        "reconciliationClaim.accountTransactionId"
      )
      .select([
        "accountTransaction.id",
        "accountTransaction.accountId",
        "accountTransaction.kind",
        "accountTransaction.amount",
        "accountTransaction.currency",
        "accountTransaction.occurredAt",
        "accountTransaction.note",
        "accountTransaction.internalTransferGroupId",
      ])
      .where("reconciliationClaim.paymentId", "=", id)
  )

const createPaymentAccounts = async (
  deps: EvoluDep & EvoluOwnerIdDep
): Promise<{
  readonly cashRegisterAccountId: AccountId
  readonly sparkAccountId: AccountId
  readonly ibanAccountId: AccountId
}> => {
  await using run = testCreateRun(deps)
  const cashRegisterAccountId = await run.ok(
    createAccount({
      deviceId: null,
      name: NonEmptyString255("Cash register"),
      cashRegister: {
        currency: "CZK",
      },
    })
  )
  const sparkAccountId = await run.ok(
    createAccount({
      deviceId: null,
      name: NonEmptyString255("Spark wallet"),
      spark: {
        secret: SparkSecret("42373a7543db65ae0228ead6c9cbffcc"),
      },
    })
  )
  const ibanAccountId = await run.ok(
    createAccount({
      deviceId: null,
      name: NonEmptyString255("Bank account"),
      iban: {
        iban: IbanSchema.decode("CZ6508000000192000145399"),
        currency: "CZK",
      },
    })
  )

  return {
    cashRegisterAccountId,
    sparkAccountId,
    ibanAccountId,
  }
}

describe("payment actions", () => {
  test("creates and loads a payment with payment option details through real Evolu", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId, sparkAccountId, ibanAccountId } =
      await createPaymentAccounts(deps)

    const id = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(1_000),
        canceledAt: null,
        expiresAt: null,
        cashRegister: {
          accountId: cashRegisterAccountId,
        },
        spark: {
          accountId: sparkAccountId,
          amountSats: NonNegativeInteger(20_000),
          exchangeRate: PositiveNumber(1_500_000),
          exchangeRateSource: "yadio",
          exchangeRateFetchedAt: TimestampMs(1_700_000_000_000),
          lightning: {
            lnInvoice: NonEmptyStringSchema.decode("lnbc200u1test"),
            lightningReceiveRequestId: null,
            paymentHash: NonEmptyStringSchema.decode("abc"),
            paymentPreimage: null,
          },
          sparkInvoice: {
            sparkInvoice: NonEmptyStringSchema.decode("spark-invoice-test"),
          },
        },
        iban: {
          accountId: ibanAccountId,
          variableSymbol: VariableSymbol("1234567890"),
          specificSymbol: SpecificSymbol("9876543210"),
        },
      })
    )

    await expect
      .poll(() => evolu.loadQuery(paymentWithDetailsByIdQuery(id)))
      .toMatchObject([
        {
          id,
          deviceId: null,
          billId: null,
          tableId: null,
          amount: 12_900,
          currency: "CZK",
          tipAmount: 1_000,
          canceledAt: null,
          cashRegister: {
            id,
            accountId: cashRegisterAccountId,
          },
          spark: {
            id,
            accountId: sparkAccountId,
            amountSats: 20_000,
            exchangeRate: 1_500_000,
            exchangeRateSource: "yadio",
            exchangeRateFetchedAt: 1_700_000_000_000,
            lnInvoice: "lnbc200u1test",
            sparkInvoice: "spark-invoice-test",
            paymentHash: "abc",
          },
          iban: {
            id,
            accountId: ibanAccountId,
            variableSymbol: "1234567890",
            specificSymbol: "9876543210",
          },
        },
      ])

    await expect
      .poll(() =>
        evolu.loadQuery(
          createQuery((db) =>
            db.selectFrom("paymentNumber").selectAll().where("id", "=", id)
          )
        )
      )
      .toMatchObject([
        {
          id,
          serialNumber: 1,
          date: "2026-06-05",
        },
      ])

    await expect(run(loadPayment(id))).resolves.toMatchObject({
      ok: true,
      value: {
        id,
        amount: 12_900,
        currency: "CZK",
        tipAmount: 1_000,
      },
    })

    // No bill — nothing to snapshot.
    await expect(
      evolu.loadQuery(paymentLinesByPaymentIdQuery(id))
    ).resolves.toEqual([])
  }, 15_000)

  test("diffs a payment's frozen snapshot against the live bill through the real producers", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)

    const billId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    // A manual amount and a tip with the same name and amount: one shared
    // `item` snapshot, two separate lines — the collision that made the diff
    // key on something unique.
    await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Tip"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(500),
      })
    )
    await run.orThrow(
      addTipToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Tip"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(500),
      })
    )

    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(1_000),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
      })
    )

    const loadDiff = async () => {
      const [paymentLines, itemRows, current] = await Promise.all([
        evolu.loadQuery(paymentLinesByPaymentIdQuery(paymentId)),
        evolu.loadQuery(itemsByPaymentIdQuery(paymentId)),
        run.ok(loadCalculatedBillLineSummaries(billId)),
      ])

      return deriveBillLineSummaryDiff(
        paymentLinesToBillLineSummaries(paymentLines, itemRows),
        current
      )
    }

    // Nothing has moved yet. This is the property the diff's whole first pass
    // rests on: `paymentLinesToBillLineSummaries` and
    // `calculateBillLineSummaries` must derive the *same* summary ids for the
    // same line, or an untouched bill would read as every line removed and
    // re-added. The unit tests around `deriveBillLineSummaryDiff` build both
    // sides by hand and cannot catch that.
    await expect.poll(loadDiff).toEqual({
      added: [],
      removed: [],
      changed: [],
    })
  }, 15_000)

  test("snapshots the bill's line-item summaries as paymentLine rows when the payment is tied to a bill", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)

    const billId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Dinner"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(1_000),
      })
    )
    const expectedSummaries = await run.ok(
      loadCalculatedBillLineSummaries(billId)
    )

    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(1_000),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
      })
    )

    await expect
      .poll(() => evolu.loadQuery(paymentLinesByPaymentIdQuery(paymentId)))
      .toMatchObject(
        expectedSummaries.map((summary) => ({
          paymentId,
          billId,
          catalogItemId: summary.catalogItemId,
          itemId: summary.itemId,
          type: summary.type,
          quantity: summary.quantity,
          totalAmount: summary.totalAmount,
        }))
      )

    // Simulates another (still offline) device adding an item to the same
    // bill after this payment was created — a direct, unguarded write, the
    // same way the e2e bridge simulates it, since `addManualAmountToBill`'s
    // own editing lock correctly refuses this on this device (a pending
    // payment locks the bill). Must not retroactively change the frozen
    // snapshot — that's the whole point of it.
    const extraSnapshot = createStandaloneItemSnapshot({
      catalogItemId: null,
      name: NonEmptyString255("Extra"),
      description: null,
      currency: "CZK",
      unitAmount: NonNegativeInteger(300),
      taxRateId: null,
    })
    await runMutationWithCompletion((options) => {
      upsertItemSnapshot(evolu, extraSnapshot, {
        ...options,
        ownerId: deps.evoluOwnerId,
      })
      insertBillLineRows(
        evolu,
        [
          {
            billId,
            deviceId: null,
            catalogItemId: null,
            itemId: extraSnapshot.id,
            type: "manualAmount",
            kind: "add",
            quantity: PositiveNumber(1),
            totalAmount: NonNegativeInteger(300),
          },
        ],
        { ...options, ownerId: deps.evoluOwnerId }
      )
    })

    const snapshotRows = await evolu.loadQuery(
      paymentLinesByPaymentIdQuery(paymentId)
    )
    expect(snapshotRows).toHaveLength(expectedSummaries.length)
  }, 15_000)

  test("creates a prepared payment by generating spark payment details", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      fetch: async () =>
        new Response(
          JSON.stringify({
            BTC: 1_500_000,
            timestamp: 1_700_000_000_000,
          })
        ),
      sparkWallet: {
        create: async () =>
          createFakeSparkWallet({
            createLightningInvoice: async () => ({
              id: "lightning-request-1",
              invoice: {
                encodedInvoice: "lnbc8600n1prepared",
                paymentHash: "payment-hash-1",
              },
              paymentPreimage: "payment-preimage-1",
              sparkInvoice: "spark-invoice-1",
            }),
          }),
      },
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
      ...createYadioApiDep(),
    } satisfies EvoluDep &
      EvoluOwnerIdDep &
      DateDep &
      FetchDep &
      SparkWalletDep &
      YadioApiDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId, sparkAccountId, ibanAccountId } =
      await createPaymentAccounts(deps)

    const idResult = await run(
      createPreparedPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(1_000),
        canceledAt: null,
        cashRegister: {
          accountId: cashRegisterAccountId,
        },
        spark: {
          accountId: sparkAccountId,
          memo: "Payment 129 CZK",
          expirySeconds: 900,
        },
        iban: {
          accountId: ibanAccountId,
          variableSymbol: VariableSymbol("1234567890"),
          specificSymbol: null,
        },
      })
    )

    expect(idResult.ok).toBe(true)
    if (!idResult.ok) return

    const id = idResult.value
    await expect
      .poll(() => evolu.loadQuery(paymentWithDetailsByIdQuery(id)))
      .toMatchObject([
        {
          id,
          amount: 12_900,
          currency: "CZK",
          tipAmount: 1_000,
          expiresAt: fixedDate.getTime() + 900_000,
          cashRegister: {
            id,
            accountId: cashRegisterAccountId,
          },
          spark: {
            id,
            accountId: sparkAccountId,
            amountSats: 8_600,
            exchangeRate: 1_500_000,
            exchangeRateSource: "yadio",
            exchangeRateFetchedAt: 1_700_000_000_000,
            lnInvoice: "lnbc8600n1prepared",
            sparkInvoice: "spark-invoice-1",
            lightningReceiveRequestId: "lightning-request-1",
            paymentHash: "payment-hash-1",
            paymentPreimage: "payment-preimage-1",
          },
          iban: {
            id,
            accountId: ibanAccountId,
            variableSymbol: "1234567890",
            specificSymbol: null,
          },
        },
      ])
  }, 15_000)

  test("prepares payment method details lazily for an existing payment", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      fetch: async () =>
        new Response(
          JSON.stringify({
            BTC: 1_500_000,
            timestamp: 1_700_000_000_000,
          })
        ),
      sparkWallet: {
        create: async () =>
          createFakeSparkWallet({
            createLightningInvoice: async () => ({
              id: "lightning-request-1",
              invoice: {
                encodedInvoice: "lnbc8600n1lazy",
                paymentHash: "payment-hash-1",
              },
              paymentPreimage: "payment-preimage-1",
              sparkInvoice: "spark-invoice-1",
            }),
          }),
      },
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
      ...createYadioApiDep(),
    } satisfies EvoluDep &
      EvoluOwnerIdDep &
      DateDep &
      FetchDep &
      SparkWalletDep &
      YadioApiDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId, sparkAccountId, ibanAccountId } =
      await createPaymentAccounts(deps)

    const id = await run.orThrow(
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

    await expect(
      run(
        preparePaymentMethod({
          paymentId: id,
          cashRegister: {
            accountId: cashRegisterAccountId,
          },
          bank: {
            accountId: ibanAccountId,
          },
          spark: {
            accountId: sparkAccountId,
            expirySeconds: 1_800,
          },
        })
      )
    ).resolves.toEqual({ ok: true, value: id })

    await expect
      .poll(() => evolu.loadQuery(paymentWithDetailsByIdQuery(id)))
      .toMatchObject([
        {
          id,
          // Cash and IBAN never expire, so a payment offering them stays
          // payable however long the Lightning invoice has been dead —
          // `expiresAt` describes the whole payment, not one method of it.
          // See docs/bill-payment-states.md.
          expiresAt: null,
          cashRegister: {
            id,
            accountId: cashRegisterAccountId,
          },
          iban: {
            id,
            accountId: ibanAccountId,
            variableSymbol: "1",
            specificSymbol: "260605",
          },
          spark: {
            id,
            accountId: sparkAccountId,
            amountSats: 8_600,
            exchangeRate: 1_500_000,
            exchangeRateSource: "yadio",
            exchangeRateFetchedAt: 1_700_000_000_000,
            lnInvoice: "lnbc8600n1lazy",
            sparkInvoice: "spark-invoice-1",
          },
        },
      ])
  }, 15_000)

  test("refuses a Lightning invoice for a zero amount, and rounds the smallest chargeable one up to a sat", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const requestedAmountsSats: Array<number | undefined> = []
    const deps = {
      evolu,
      fetch: async () =>
        new Response(
          JSON.stringify({ BTC: 1_500_000, timestamp: 1_700_000_000_000 })
        ),
      sparkWallet: {
        create: async () =>
          createFakeSparkWallet({
            createLightningInvoice: async (input: {
              readonly amountSats?: number
            }) => {
              requestedAmountsSats.push(input.amountSats)
              return {
                id: "lightning-request-1",
                invoice: {
                  encodedInvoice: "lnbc1zero",
                  paymentHash: "payment-hash-1",
                },
                paymentPreimage: "payment-preimage-1",
                sparkInvoice: "spark-invoice-1",
              }
            },
          }),
      },
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
      ...createYadioApiDep(),
    } satisfies EvoluDep &
      EvoluOwnerIdDep &
      DateDep &
      FetchDep &
      SparkWalletDep &
      YadioApiDep
    await using run = testCreateRun(deps)
    const { sparkAccountId } = await createPaymentAccounts(deps)

    const paymentFor = (amount: number) =>
      run.orThrow(
        createPayment({
          deviceId: null,
          billId: null,
          tableId: null,
          amount: NonNegativeInteger(amount),
          currency: "CZK",
          tipAmount: NonNegativeInteger(0),
          canceledAt: null,
          expiresAt: null,
        })
      )

    // The keypad only checks that the entered amount parses, so "0" charges.
    // A zero-sat Lightning invoice is an *amountless* one — the payer picks
    // the sum — which on a terminal showing 0 is not something to hand out.
    const zeroPaymentId = await paymentFor(0)
    await expect(
      run(
        preparePaymentMethod({
          paymentId: zeroPaymentId,
          spark: { accountId: sparkAccountId },
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { type: "ZeroAmountNotPayable", amount: 0 },
    })
    expect(requestedAmountsSats).toEqual([])

    // One minor unit converts to a fraction of a sat at this rate, and is
    // charged as one sat rather than rounded away to an amountless invoice.
    const smallestPaymentId = await paymentFor(1)
    await expect(
      run(
        preparePaymentMethod({
          paymentId: smallestPaymentId,
          spark: { accountId: sparkAccountId },
        })
      )
    ).resolves.toEqual({ ok: true, value: smallestPaymentId })
    expect(requestedAmountsSats).toEqual([1])
  }, 15_000)

  test("keeps a Lightning payment's expiry in step with the invoice, even when the caller omits expirySeconds", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      fetch: async () =>
        new Response(
          JSON.stringify({ BTC: 1_500_000, timestamp: 1_700_000_000_000 })
        ),
      sparkWallet: {
        create: async () =>
          createFakeSparkWallet({
            createLightningInvoice: async () => ({
              id: "lightning-request-1",
              invoice: {
                encodedInvoice: "lnbc8600n1expiry",
                paymentHash: "payment-hash-1",
              },
              paymentPreimage: "payment-preimage-1",
              sparkInvoice: "spark-invoice-1",
            }),
          }),
      },
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
      ...createYadioApiDep(),
    } satisfies EvoluDep &
      EvoluOwnerIdDep &
      DateDep &
      FetchDep &
      SparkWalletDep &
      YadioApiDep
    await using run = testCreateRun(deps)
    const { sparkAccountId } = await createPaymentAccounts(deps)

    const expiresAtOf = async (paymentId: PaymentId) =>
      (await evolu.loadQuery(paymentByIdQuery(paymentId)))[0]?.expiresAt

    const id = await run.orThrow(
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

    // An explicit, deliberately short window first.
    await expect(
      run(
        preparePaymentMethod({
          paymentId: id,
          spark: { accountId: sparkAccountId, expirySeconds: 60 },
        })
      )
    ).resolves.toEqual({ ok: true, value: id })
    await expect.poll(() => expiresAtOf(id)).toBe(fixedDate.getTime() + 60_000)

    // Re-prepared with no `expirySeconds`: the invoice gets a fresh window
    // regardless, so leaving the old 60-second stamp behind would report a
    // live payment as expired and release the bill's editing lock.
    await expect(
      run(
        preparePaymentMethod({
          paymentId: id,
          spark: { accountId: sparkAccountId },
        })
      )
    ).resolves.toEqual({ ok: true, value: id })
    await expect
      .poll(() => expiresAtOf(id))
      .toBe(
        fixedDate.getTime() + DEFAULT_LIGHTNING_INVOICE_EXPIRY_SECONDS * 1_000
      )

    // Same for a payment created straight through `createPreparedPayment`
    // without one — the shape `bin/cli-payments.ts` uses. A null `expiresAt`
    // there means the payment never reads as expired and the bill stays
    // locked for good.
    const preparedId = await run.orThrow(
      createPreparedPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        spark: { accountId: sparkAccountId },
      })
    )
    await expect
      .poll(() => expiresAtOf(preparedId))
      .toBe(
        fixedDate.getTime() + DEFAULT_LIGHTNING_INVOICE_EXPIRY_SECONDS * 1_000
      )
  }, 15_000)

  test("preparing cash after Lightning clears the payment's expiry", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      fetch: async () =>
        new Response(
          JSON.stringify({
            BTC: 1_500_000,
            timestamp: 1_700_000_000_000,
          })
        ),
      sparkWallet: {
        create: async () =>
          createFakeSparkWallet({
            createLightningInvoice: async () => ({
              id: "lightning-request-1",
              invoice: {
                encodedInvoice: "lnbc8600n1switch",
                paymentHash: "payment-hash-1",
              },
              paymentPreimage: "payment-preimage-1",
              sparkInvoice: "spark-invoice-1",
            }),
          }),
      },
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
      ...createYadioApiDep(),
    } satisfies EvoluDep &
      EvoluOwnerIdDep &
      DateDep &
      FetchDep &
      SparkWalletDep &
      YadioApiDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId, sparkAccountId } =
      await createPaymentAccounts(deps)

    const id = await run.orThrow(
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

    await expect(
      run(
        preparePaymentMethod({
          paymentId: id,
          spark: { accountId: sparkAccountId, expirySeconds: 900 },
        })
      )
    ).resolves.toEqual({ ok: true, value: id })

    await expect
      .poll(() => evolu.loadQuery(paymentWithDetailsByIdQuery(id)))
      .toMatchObject([{ id, expiresAt: fixedDate.getTime() + 900_000 }])

    // Switching the same payment to cash must not leave the dead invoice's
    // expiry behind: `derivePaymentStatus` would call this live cash payment
    // Expired 15 minutes later and silently release its bill's editing lock.
    await expect(
      run(
        preparePaymentMethod({
          paymentId: id,
          cashRegister: { accountId: cashRegisterAccountId },
        })
      )
    ).resolves.toEqual({ ok: true, value: id })

    await expect
      .poll(() => evolu.loadQuery(paymentWithDetailsByIdQuery(id)))
      .toMatchObject([
        {
          id,
          expiresAt: null,
          cashRegister: { id, accountId: cashRegisterAccountId },
        },
      ])
  }, 15_000)

  test("prepares Spark payment method when optional Spark SDK fields are null", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      fetch: async () =>
        new Response(
          JSON.stringify({
            BTC: 1_500_000,
            timestamp: 1_700_000_000_000,
          })
        ),
      sparkWallet: {
        create: async () =>
          createFakeSparkWallet({
            createLightningInvoice: async () => ({
              id: null,
              invoice: {
                encodedInvoice: "lnbc8600n1nullable",
                paymentHash: null,
              },
              paymentPreimage: null,
              sparkInvoice: null,
            }),
          }),
      },
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
      ...createYadioApiDep(),
    } satisfies EvoluDep &
      EvoluOwnerIdDep &
      DateDep &
      FetchDep &
      SparkWalletDep &
      YadioApiDep
    await using run = testCreateRun(deps)
    const { sparkAccountId } = await createPaymentAccounts(deps)
    const id = await run.orThrow(
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

    await expect(
      run(
        preparePaymentMethod({
          paymentId: id,
          spark: {
            accountId: sparkAccountId,
          },
        })
      )
    ).resolves.toEqual({ ok: true, value: id })

    await expect
      .poll(() => evolu.loadQuery(paymentWithDetailsByIdQuery(id)))
      .toMatchObject([
        {
          id,
          spark: {
            id,
            accountId: sparkAccountId,
            lnInvoice: "lnbc8600n1nullable",
            sparkInvoice: null,
            lightningReceiveRequestId: null,
            paymentHash: null,
            paymentPreimage: null,
          },
        },
      ])
  }, 15_000)

  test("preparePaymentMethod refuses each method against a missing or wrong-currency account", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      // Spark and Yadio are wired up but never reached: every case below
      // fails its account check first.
      fetch: async () =>
        new Response(
          JSON.stringify({ BTC: 1_500_000, timestamp: 1_700_000_000_000 })
        ),
      sparkWallet: { create: async () => createFakeSparkWallet({}) },
      ...createDateDeps(),
      ...createYadioApiDep(),
    } satisfies EvoluDep &
      EvoluOwnerIdDep &
      DateDep &
      SparkWalletDep &
      FetchDep &
      YadioApiDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId, ibanAccountId, sparkAccountId } =
      await createPaymentAccounts(deps)

    const czkPaymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(1_000),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
      })
    )
    const eurPaymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(1_000),
        currency: "EUR",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
      })
    )

    // Each method reports its own not-found error for an account of the wrong
    // kind, and its own `accountKind` on a currency mismatch. These are the
    // branches `preparePaymentMethod` propagates out of three concurrent
    // preparations, so they are worth pinning before that plumbing moves.
    await expect(
      run(
        preparePaymentMethod({
          paymentId: czkPaymentId,
          bank: { accountId: cashRegisterAccountId },
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { type: "IbanAccountNotFound", id: cashRegisterAccountId },
    })
    await expect(
      run(
        preparePaymentMethod({
          paymentId: czkPaymentId,
          cashRegister: { accountId: ibanAccountId },
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { type: "CashRegisterAccountNotFound", id: ibanAccountId },
    })
    await expect(
      run(
        preparePaymentMethod({
          paymentId: eurPaymentId,
          bank: { accountId: ibanAccountId },
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { type: "AccountCurrencyMismatch", accountKind: "iban" },
    })
    await expect(
      run(
        preparePaymentMethod({
          paymentId: eurPaymentId,
          cashRegister: { accountId: cashRegisterAccountId },
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { type: "AccountCurrencyMismatch", accountKind: "cashRegister" },
    })
    await expect(
      run(
        preparePaymentMethod({
          paymentId: czkPaymentId,
          spark: { accountId: cashRegisterAccountId },
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { type: "AccountSparkNotFound", id: cashRegisterAccountId },
    })

    // Requesting no method at all is a no-op success, not a failure.
    await expect(
      run(preparePaymentMethod({ paymentId: czkPaymentId }))
    ).resolves.toEqual({ ok: true, value: czkPaymentId })

    // A refusal writes nothing: the spark account is real, so this proves the
    // failures above short-circuited before the mutation batch.
    expect(sparkAccountId).toBeDefined()
    await expect(
      evolu.loadQuery(
        createQuery((db) => db.selectFrom("paymentIban").select(["id"]))
      )
    ).resolves.toEqual([])
    await expect(
      evolu.loadQuery(
        createQuery((db) => db.selectFrom("paymentCashRegister").select(["id"]))
      )
    ).resolves.toEqual([])
  }, 15_000)

  test("preparePaymentMethod refuses a bank method for a payment whose number hasn't synced", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      // `preparePaymentMethod` declares these even for a bank-only call.
      fetch: async () => new Response("{}"),
      sparkWallet: { create: async () => createFakeSparkWallet({}) },
      ...createDateDeps(),
      ...createYadioApiDep(),
    } satisfies EvoluDep &
      EvoluOwnerIdDep &
      DateDep &
      SparkWalletDep &
      FetchDep &
      YadioApiDep
    await using run = testCreateRun(deps)
    const { ibanAccountId } = await createPaymentAccounts(deps)

    // Written directly rather than through `createPayment`, which always
    // writes the `paymentNumber` in the same batch: this is the CRDT shape
    // where the payment row arrived from another device before its number
    // did. The IBAN method needs that number for the variable symbol.
    const orphanPaymentId = createTableId<"Payment">()
    await runMutationWithCompletion((options) =>
      evolu.upsert(
        "payment",
        {
          id: orphanPaymentId,
          deviceId: null,
          billId: null,
          tableId: null,
          amount: NonNegativeInteger(1_000),
          currency: "CZK",
          tipAmount: NonNegativeInteger(0),
          canceledAt: null,
          confirmedPaidAt: null,
          excessAcknowledgedAt: null,
          expiresAt: null,
        },
        { ...options, ownerId: evolu.appOwner.id }
      )
    )

    await expect(
      run(
        preparePaymentMethod({
          paymentId: orphanPaymentId,
          bank: { accountId: ibanAccountId },
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { type: "PaymentNumberNotFound", paymentId: orphanPaymentId },
    })
  }, 15_000)

  test("marks a payment paid in cash by creating a cash account transaction", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)
    const occurredAt = TimestampMsSchema.decode(1_700_000_000_000)
    const note = NonEmptyStringSchema.decode("Paid in cash")

    const id = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: {
          accountId: cashRegisterAccountId,
        },
      })
    )

    await expect(
      run(
        markPaymentPaidCash({
          paymentId: id,
          accountId: cashRegisterAccountId,
          occurredAt,
          note,
        })
      )
    ).resolves.toEqual({
      ok: true,
      value: id,
    })

    await expect
      .poll(() => evolu.loadQuery(accountTransactionsByPaymentIdQuery(id)))
      .toMatchObject([
        {
          accountId: cashRegisterAccountId,
          kind: "cashRegister",
          amount: 12_900,
          currency: "CZK",
          occurredAt,
          note,
          internalTransferGroupId: null,
        },
      ])

    const [accountTransaction] = await evolu.loadQuery(
      accountTransactionsByPaymentIdQuery(id)
    )
    await expect
      .poll(() => evolu.loadQuery(reconciliationClaimsByPaymentIdQuery(id)))
      .toMatchObject([
        {
          paymentId: id,
          accountTransactionId: accountTransaction?.id,
          source: "manual",
        },
      ])
  }, 15_000)

  test("marking a payment paid in cash twice to the same account does not duplicate the transaction or claim", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)
    const occurredAt = TimestampMsSchema.decode(1_700_000_000_000)
    const note = NonEmptyStringSchema.decode("Paid in cash")

    const id = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: {
          accountId: cashRegisterAccountId,
        },
      })
    )

    await expect(
      run(
        markPaymentPaidCash({
          paymentId: id,
          accountId: cashRegisterAccountId,
          occurredAt,
          note,
        })
      )
    ).resolves.toEqual({ ok: true, value: id })

    await expect
      .poll(() => evolu.loadQuery(reconciliationClaimsByPaymentIdQuery(id)))
      .toHaveLength(1)

    await expect(
      run(
        markPaymentPaidCash({
          paymentId: id,
          accountId: cashRegisterAccountId,
          occurredAt,
          note,
        })
      )
    ).resolves.toEqual({ ok: true, value: id })

    const claims = await evolu.loadQuery(
      reconciliationClaimsByPaymentIdQuery(id)
    )
    expect(claims).toHaveLength(1)

    const transactions = await evolu.loadQuery(
      accountTransactionsByPaymentIdQuery(id)
    )
    expect(transactions).toHaveLength(1)
  }, 15_000)

  test("marking a payment paid in cash to two different accounts creates two transactions and two claims", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)
    const secondCashRegisterAccountId = await run.ok(
      createAccount({
        deviceId: null,
        name: NonEmptyString255("Second cash register"),
        cashRegister: {
          currency: "CZK",
        },
      })
    )
    const occurredAt = TimestampMsSchema.decode(1_700_000_000_000)

    const id = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: {
          accountId: cashRegisterAccountId,
        },
      })
    )

    await expect(
      run(
        markPaymentPaidCash({
          paymentId: id,
          accountId: cashRegisterAccountId,
          occurredAt,
        })
      )
    ).resolves.toEqual({ ok: true, value: id })

    await expect(
      run(
        markPaymentPaidCash({
          paymentId: id,
          accountId: secondCashRegisterAccountId,
          occurredAt,
        })
      )
    ).resolves.toEqual({ ok: true, value: id })

    await expect
      .poll(() => evolu.loadQuery(reconciliationClaimsByPaymentIdQuery(id)))
      .toHaveLength(2)

    const transactions = await evolu.loadQuery(
      accountTransactionsByPaymentIdQuery(id)
    )
    expect(transactions).toHaveLength(2)
    expect(transactions.map((t) => t.accountId).toSorted()).toEqual(
      [cashRegisterAccountId, secondCashRegisterAccountId].toSorted()
    )
  }, 15_000)

  test("cancels a payment", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { ibanAccountId } = await createPaymentAccounts(deps)

    const id = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        iban: {
          accountId: ibanAccountId,
          variableSymbol: undefined,
          specificSymbol: null,
        },
      })
    )

    await expect(run(cancelPayment(id))).resolves.toEqual({
      ok: true,
      value: id,
    })

    await expect
      .poll(() => evolu.loadQuery(paymentByIdQuery(id)))
      .toMatchObject([
        {
          id,
        },
      ])
    await expect
      .poll(() => evolu.loadQuery(paymentByIdQuery(id)))
      .toSatisfy((rows) => rows[0]?.canceledAt !== null)
  }, 15_000)

  test("rejects canceling a payment that already has an active claim", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)

    const id = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: {
          accountId: cashRegisterAccountId,
        },
      })
    )

    await expect(
      run(
        markPaymentPaidCash({
          paymentId: id,
          accountId: cashRegisterAccountId,
        })
      )
    ).resolves.toMatchObject({ ok: true })

    await expect(run(cancelPayment(id))).resolves.toMatchObject({
      ok: false,
      error: { type: "PaymentAlreadyPaid", id },
    })

    await expect
      .poll(() => evolu.loadQuery(paymentByIdQuery(id)))
      .toMatchObject([{ id, canceledAt: null }])
  }, 15_000)

  test("resolves a canceled+claimed collision back to paid via confirmPaymentPaidDespiteCancellation", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)

    const id = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId: cashRegisterAccountId },
      })
    )

    await expect(
      run(
        markPaymentPaidCash({
          paymentId: id,
          accountId: cashRegisterAccountId,
        })
      )
    ).resolves.toMatchObject({ ok: true })

    // `cancelPayment` itself refuses to cancel an already-claimed payment
    // (see "rejects canceling a payment that already has an active claim"
    // above), so simulate the CRDT merge race the same way "a payment
    // canceled after being claimed" does further down this file.
    evolu.update("payment", {
      id,
      canceledAt: TimestampMsSchema.decode(deps.date.now().getTime()),
    })
    await expect
      .poll(() => evolu.loadQuery(paymentByIdQuery(id)))
      .toSatisfy((rows) => rows[0]?.canceledAt !== null)

    await expect(
      run(confirmPaymentPaidDespiteCancellation(id))
    ).resolves.toEqual({ ok: true, value: id })

    await expect
      .poll(() => evolu.loadQuery(paymentByIdQuery(id)))
      .toSatisfy((rows) => rows[0]?.confirmedPaidAt !== null)

    // Calling it again on an already-resolved payment is an idempotent
    // no-op, not a rejection — `canceledAt` and the claim are both still
    // there, exactly what the guard requires.
    await expect(
      run(confirmPaymentPaidDespiteCancellation(id))
    ).resolves.toEqual({ ok: true, value: id })
  }, 15_000)

  test("rejects confirmPaymentPaidDespiteCancellation on a payment that isn't canceled", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)

    const id = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId: cashRegisterAccountId },
      })
    )

    await expect(
      run(
        markPaymentPaidCash({
          paymentId: id,
          accountId: cashRegisterAccountId,
        })
      )
    ).resolves.toMatchObject({ ok: true })

    await expect(
      run(confirmPaymentPaidDespiteCancellation(id))
    ).resolves.toMatchObject({
      ok: false,
      error: { type: "PaymentNotCanceled", id },
    })
  }, 15_000)

  test("rejects confirmPaymentPaidDespiteCancellation on a canceled payment with no active claim", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { ibanAccountId } = await createPaymentAccounts(deps)

    const id = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        iban: {
          accountId: ibanAccountId,
          variableSymbol: undefined,
          specificSymbol: null,
        },
      })
    )

    await expect(run(cancelPayment(id))).resolves.toMatchObject({ ok: true })

    await expect(
      run(confirmPaymentPaidDespiteCancellation(id))
    ).resolves.toMatchObject({
      ok: false,
      error: { type: "PaymentNotClaimed", id },
    })
  }, 15_000)

  test("resolves a duplicate-settlement collision via acknowledgePaymentExcessSettlement", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId, ibanAccountId } =
      await createPaymentAccounts(deps)

    // A payment prepared with both cash and IBAN as offered methods — the
    // same multi-method design `preparePaymentMethod` supports for a real
    // payment attempt.
    const id = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId: cashRegisterAccountId },
        iban: {
          accountId: ibanAccountId,
          variableSymbol: VariableSymbol("123456"),
          specificSymbol: SpecificSymbol("260605"),
        },
      })
    )

    await expect(
      run(
        markPaymentPaidCash({
          paymentId: id,
          accountId: cashRegisterAccountId,
        })
      )
    ).resolves.toMatchObject({ ok: true })

    // Simulate a second offline device independently settling the *same*
    // payment through the other prepared method — a real, distinct incoming
    // bank transaction, manually reconciled (the automatic IBAN matcher
    // itself excludes an already-claimed payment; a genuine CRDT merge race
    // bypasses that exclusion the same way, since each device only sees its
    // own claim at write time). See docs/bill-payment-states.md.
    const secondTransactionId = await run.ok(
      createAccountTransaction({
        accountId: ibanAccountId,
        amount: Integer(12_900),
        currency: "CZK",
        occurredAt: TimestampMsSchema.decode(deps.date.now().getTime()),
        note: null,
        internalTransferGroupId: null,
        source: { deviceId: null, source: "auto" },
        iban: {
          variableSymbol: VariableSymbol("123456"),
          constantSymbol: null,
          specificSymbol: SpecificSymbol("260605"),
          bankReference: NonEmptyString255("123456789"),
        },
      })
    )
    await expect(
      run(
        claimManualReconciliation({
          paymentId: id,
          accountTransactionId: secondTransactionId,
          deviceId: null,
        })
      )
    ).resolves.toMatchObject({ ok: true })

    await expect(run(acknowledgePaymentExcessSettlement(id))).resolves.toEqual({
      ok: true,
      value: id,
    })

    await expect
      .poll(() => evolu.loadQuery(paymentByIdQuery(id)))
      .toSatisfy((rows) => rows[0]?.excessAcknowledgedAt !== null)

    // Idempotent: still claimed for more than its amount, so re-resolving is
    // a no-op, not a rejection.
    await expect(run(acknowledgePaymentExcessSettlement(id))).resolves.toEqual({
      ok: true,
      value: id,
    })
  }, 15_000)

  test("rejects acknowledgePaymentExcessSettlement on a payment that isn't overpaid", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)

    const id = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId: cashRegisterAccountId },
      })
    )

    await expect(
      run(
        markPaymentPaidCash({
          paymentId: id,
          accountId: cashRegisterAccountId,
        })
      )
    ).resolves.toMatchObject({ ok: true })

    await expect(
      run(acknowledgePaymentExcessSettlement(id))
    ).resolves.toMatchObject({
      ok: false,
      error: { type: "PaymentNotOverpaid", id },
    })
  }, 15_000)

  test("resolving a payment's canceled+claimed collision never changes its bill's coverage or status", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)

    const billId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Dinner"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(1_000),
      })
    )
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(1_000),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId: cashRegisterAccountId },
      })
    )
    await expect(
      run(
        markPaymentPaidCash({
          paymentId,
          accountId: cashRegisterAccountId,
        })
      )
    ).resolves.toMatchObject({ ok: true })
    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("closed")

    // Simulate the CRDT merge race (same as "a payment canceled after being
    // claimed" below): the payment ends up canceled+claimed, independent of
    // whatever its bill is doing.
    evolu.update("payment", {
      id: paymentId,
      canceledAt: TimestampMsSchema.decode(deps.date.now().getTime()),
    })
    await expect
      .poll(() => evolu.loadQuery(paymentByIdQuery(paymentId)))
      .toSatisfy((rows) => rows[0]?.canceledAt !== null)

    // The bill is still closed/paid throughout — a payment's own display
    // collision never touches bill coverage either way.
    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("closed")
    const coverageBeforeResolve = await run.ok(loadBillCoverage(billId))

    await expect(
      run(confirmPaymentPaidDespiteCancellation(paymentId))
    ).resolves.toMatchObject({ ok: true })

    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("closed")
    await expect(run.ok(loadBillCoverage(billId))).resolves.toEqual(
      coverageBeforeResolve
    )
  }, 15_000)

  test("updates a payment's amount and its cashRegister/spark/iban details", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId, sparkAccountId, ibanAccountId } =
      await createPaymentAccounts(deps)

    const id = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(1_000),
        canceledAt: null,
        expiresAt: null,
        cashRegister: {
          accountId: cashRegisterAccountId,
        },
        spark: {
          accountId: sparkAccountId,
          amountSats: NonNegativeInteger(20_000),
          exchangeRate: PositiveNumber(1_500_000),
          exchangeRateSource: "yadio",
          exchangeRateFetchedAt: TimestampMs(1_700_000_000_000),
          lightning: {
            lnInvoice: NonEmptyStringSchema.decode("lnbc200u1test"),
            lightningReceiveRequestId: null,
            paymentHash: NonEmptyStringSchema.decode("abc"),
            paymentPreimage: null,
          },
          sparkInvoice: {
            sparkInvoice: NonEmptyStringSchema.decode("spark-invoice-test"),
          },
        },
        iban: {
          accountId: ibanAccountId,
          variableSymbol: VariableSymbol("1234567890"),
          specificSymbol: SpecificSymbol("9876543210"),
        },
      })
    )

    await expect(
      run.ok(
        updatePayment({
          id,
          deviceId: undefined,
          billId: undefined,
          tableId: undefined,
          amount: NonNegativeInteger(15_000),
          currency: undefined,
          tipAmount: NonNegativeInteger(2_000),
          canceledAt: undefined,
          cashRegister: {
            accountId: cashRegisterAccountId,
          },
          spark: {
            amountSats: NonNegativeInteger(25_000),
            exchangeRate: PositiveNumber(1_600_000),
            lightning: {
              lnInvoice: NonEmptyStringSchema.decode("lnbc300u1test"),
            },
            sparkInvoice: {
              sparkInvoice: NonEmptyStringSchema.decode(
                "spark-invoice-updated"
              ),
            },
          },
          iban: {
            variableSymbol: VariableSymbol("1111111111"),
            specificSymbol: SpecificSymbol("2222222222"),
          },
        })
      )
    ).resolves.toBe(id)

    await expect
      .poll(() => evolu.loadQuery(paymentWithDetailsByIdQuery(id)))
      .toMatchObject([
        {
          id,
          amount: 15_000,
          tipAmount: 2_000,
          spark: {
            amountSats: 25_000,
            exchangeRate: 1_600_000,
            lnInvoice: "lnbc300u1test",
            sparkInvoice: "spark-invoice-updated",
          },
          iban: {
            variableSymbol: "1111111111",
            specificSymbol: "2222222222",
          },
        },
      ])
  }, 15_000)

  test("deletes a payment by soft-deleting it", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { ibanAccountId } = await createPaymentAccounts(deps)

    const id = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        iban: {
          accountId: ibanAccountId,
          variableSymbol: undefined,
          specificSymbol: null,
        },
      })
    )

    await expect(run.ok(deletePayment(id))).resolves.toBe(id)

    await expect
      .poll(() => evolu.loadQuery(paymentWithDetailsByIdQuery(id)))
      .toMatchObject([
        {
          id,
          isDeleted: sqliteTrue,
        },
      ])
  }, 15_000)

  test("creating a payment for a bill neither closes nor unlocks it, and a second/split payment is still accepted", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)

    const billId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )

    const firstPaymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
      })
    )

    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("open")

    // A second/split payment attempt while the first is still pending and
    // unresolved is deliberately allowed — only editing the bill's lines is
    // locked while a payment is pending, not creating another payment.
    const secondPaymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(1_000),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
      })
    )
    expect(secondPaymentId).not.toBe(firstPaymentId)

    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("open")
  }, 15_000)

  test("a pending payment locks its bill against edits; canceling the payment unlocks it again", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)

    const billId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
      })
    )

    await expect(
      run(
        addManualAmountToBill({
          billId,
          deviceId: null,
          name: NonEmptyString255("Late addition"),
          currency: "CZK",
          totalAmount: NonNegativeInteger(500),
        })
      )
    ).resolves.toMatchObject({ ok: false, error: { type: "BillLocked" } })

    await run.orThrow(cancelPayment(paymentId))

    await expect(
      run(
        addManualAmountToBill({
          billId,
          deviceId: null,
          name: NonEmptyString255("Late addition"),
          currency: "CZK",
          totalAmount: NonNegativeInteger(500),
        })
      )
    ).resolves.toMatchObject({ ok: true })
  }, 15_000)

  test("a pending payment with an expiry unlocks its bill once that expiry passes, with no cancellation needed", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    let now = new Date("2026-06-05T12:00:00.000Z")
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      date: { now: () => now },
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)

    const billId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: TimestampMsSchema.decode(now.getTime() + 900_000),
      })
    )

    await expect(
      run(
        addManualAmountToBill({
          billId,
          deviceId: null,
          name: NonEmptyString255("Late addition"),
          currency: "CZK",
          totalAmount: NonNegativeInteger(500),
        })
      )
    ).resolves.toMatchObject({ ok: false, error: { type: "BillLocked" } })

    // The clock advances past the payment's own expiry — no cancellation
    // and no other explicit action at all. docs/bill-payment-states.md:
    // Lightning has a natural resolution path via `expiresAt` (unlike cash
    // and IBAN, which need the manual "Cancel payment" escape hatch) — an
    // abandoned invoice recovers its bill purely from time passing.
    now = new Date(now.getTime() + 900_001)

    await expect(
      run(
        addManualAmountToBill({
          billId,
          deviceId: null,
          name: NonEmptyString255("Late addition"),
          currency: "CZK",
          totalAmount: NonNegativeInteger(500),
        })
      )
    ).resolves.toMatchObject({ ok: true })
  }, 15_000)

  test("confirming a payment that fully covers the bill closes it", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)

    const billId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Dinner"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(1_000),
      })
    )
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(1_000),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId: cashRegisterAccountId },
      })
    )

    await expect(
      run(markPaymentPaidCash({ paymentId, accountId: cashRegisterAccountId }))
    ).resolves.toMatchObject({ ok: true })

    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("closed")
  }, 15_000)

  test("marks a payment paid against a cash register or an IBAN account, each under its own deterministic transaction id", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId, ibanAccountId } =
      await createPaymentAccounts(deps)

    const createCzkPayment = () =>
      run.orThrow(
        createPayment({
          deviceId: null,
          billId: null,
          tableId: null,
          amount: NonNegativeInteger(1_000),
          currency: "CZK",
          tipAmount: NonNegativeInteger(0),
          canceledAt: null,
          expiresAt: null,
        })
      )
    const cashPaymentId = await createCzkPayment()
    const ibanPaymentId = await createCzkPayment()

    await expect(
      run(
        markPaymentPaidCash({
          paymentId: cashPaymentId,
          accountId: cashRegisterAccountId,
        })
      )
    ).resolves.toEqual({ ok: true, value: cashPaymentId })
    // `markPaymentPaidIban` had no coverage at all before this.
    await expect(
      run(
        markPaymentPaidIban({
          paymentId: ibanPaymentId,
          accountId: ibanAccountId,
        })
      )
    ).resolves.toEqual({ ok: true, value: ibanPaymentId })

    // The transaction ids are content-derived so a retried confirmation
    // re-uses the row instead of recording the money twice. The two prefixes
    // are *not* symmetrical — the IBAN one carries a `manual` segment and the
    // cash one does not — so they are pinned verbatim: changing either would
    // silently duplicate a settlement for every payment already confirmed.
    // Looked up by id rather than compared as an ordered list: account ids are
    // random base64url, and SQLite's binary collation does not agree with
    // JS string ordering on them.
    const transactionById = (id: string) =>
      evolu.loadQuery(
        createQuery((db) =>
          db
            .selectFrom("accountTransaction")
            .select(["id", "accountId", "amount"])
            .where("id", "=", id as never)
        )
      )

    await expect
      .poll(() =>
        transactionById(
          createIdFromString<"AccountTransaction">(
            `accountTransaction:cashRegister:payment:${cashPaymentId}:${cashRegisterAccountId}`
          )
        )
      )
      .toMatchObject([{ accountId: cashRegisterAccountId, amount: 1_000 }])
    await expect
      .poll(() =>
        transactionById(
          createIdFromString<"AccountTransaction">(
            `accountTransaction:iban:manual:payment:${ibanPaymentId}:${ibanAccountId}`
          )
        )
      )
      .toMatchObject([{ accountId: ibanAccountId, amount: 1_000 }])

    // And exactly those two rows — no stray settlement under another id.
    await expect(
      evolu.loadQuery(
        createQuery((db) => db.selectFrom("accountTransaction").select(["id"]))
      )
    ).resolves.toHaveLength(2)

    // Each path also claims its transaction against the payment — that claim
    // is what makes the payment read as paid.
    await expect
      .poll(() =>
        evolu.loadQuery(
          activeReconciliationClaimsByPaymentIdQuery(cashPaymentId)
        )
      )
      .toHaveLength(1)
    await expect
      .poll(() =>
        evolu.loadQuery(
          activeReconciliationClaimsByPaymentIdQuery(ibanPaymentId)
        )
      )
      .toHaveLength(1)
  }, 15_000)

  test("refuses to mark a payment paid against a missing or wrong-currency account", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId, ibanAccountId } =
      await createPaymentAccounts(deps)

    // Both accounts above hold CZK, so a EUR payment mismatches each of them.
    const eurPaymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(1_000),
        currency: "EUR",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
      })
    )

    await expect(
      run(
        markPaymentPaidCash({
          paymentId: eurPaymentId,
          accountId: cashRegisterAccountId,
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      error: {
        type: "AccountCurrencyMismatch",
        accountKind: "cashRegister",
        accountCurrency: "CZK",
        paymentCurrency: "EUR",
      },
    })
    await expect(
      run(
        markPaymentPaidIban({
          paymentId: eurPaymentId,
          accountId: ibanAccountId,
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      error: {
        type: "AccountCurrencyMismatch",
        accountKind: "iban",
        accountCurrency: "CZK",
        paymentCurrency: "EUR",
      },
    })

    // A cash register is not an IBAN account and vice versa: each path only
    // accepts its own kind, and reports its own not-found error.
    const czkPaymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(1_000),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
      })
    )
    await expect(
      run(
        markPaymentPaidCash({
          paymentId: czkPaymentId,
          accountId: ibanAccountId,
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { type: "CashRegisterAccountNotFound", id: ibanAccountId },
    })
    await expect(
      run(
        markPaymentPaidIban({
          paymentId: czkPaymentId,
          accountId: cashRegisterAccountId,
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { type: "IbanAccountNotFound", id: cashRegisterAccountId },
    })

    // Nothing was recorded for any of the refusals.
    await expect(
      evolu.loadQuery(
        createQuery((db) => db.selectFrom("accountTransaction").select(["id"]))
      )
    ).resolves.toEqual([])
  }, 15_000)

  test("confirming a payment that only partially covers the bill leaves it open and unlocked", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)

    const billId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Dinner"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(1_000),
      })
    )
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(400),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId: cashRegisterAccountId },
      })
    )

    await expect(
      run(markPaymentPaidCash({ paymentId, accountId: cashRegisterAccountId }))
    ).resolves.toMatchObject({ ok: true })

    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("open")

    // The confirmed payment is no longer pending (it's paid), so the bill
    // is open *and* editable again — only a live/pending payment locks it.
    await expect(
      run(
        addManualAmountToBill({
          billId,
          deviceId: null,
          name: NonEmptyString255("Dessert"),
          currency: "CZK",
          totalAmount: NonNegativeInteger(200),
        })
      )
    ).resolves.toMatchObject({ ok: true })
  }, 15_000)

  test("rejects creating a payment for a canceled bill", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)

    const billId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    await run.orThrow(cancelBill(billId))

    await expect(
      run(
        createPayment({
          deviceId: null,
          billId,
          tableId: null,
          amount: NonNegativeInteger(12_900),
          currency: "CZK",
          tipAmount: NonNegativeInteger(0),
          canceledAt: null,
          expiresAt: null,
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { type: "BillNotOpen", status: "canceled" },
    })
  }, 15_000)

  test("rejects creating a payment for an already-closed bill", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)

    const billId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Dinner"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(1_000),
      })
    )
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(1_000),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId: cashRegisterAccountId },
      })
    )
    await run.orThrow(
      markPaymentPaidCash({ paymentId, accountId: cashRegisterAccountId })
    )
    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("closed")

    await expect(
      run(
        createPayment({
          deviceId: null,
          billId,
          tableId: null,
          amount: NonNegativeInteger(500),
          currency: "CZK",
          tipAmount: NonNegativeInteger(0),
          canceledAt: null,
          expiresAt: null,
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { type: "BillNotOpen", status: "closed" },
    })
  }, 15_000)

  test("rejects creating a payment for a bill resolved via confirmBillClosedDespiteCancellation", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)

    const billId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Dinner"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(1_000),
      })
    )
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(1_000),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId: cashRegisterAccountId },
      })
    )
    await run.orThrow(cancelBill(billId))
    await run.orThrow(
      markPaymentPaidCash({ paymentId, accountId: cashRegisterAccountId })
    )
    await run.orThrow(confirmBillClosedDespiteCancellation(billId))
    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("closed")

    // Once resolved, the bill is just as final as an ordinarily-closed one
    // — a new payment attempt is rejected the same way.
    await expect(
      run(
        createPayment({
          deviceId: null,
          billId,
          tableId: null,
          amount: NonNegativeInteger(500),
          currency: "CZK",
          tipAmount: NonNegativeInteger(0),
          canceledAt: null,
          expiresAt: null,
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { type: "BillNotOpen", status: "closed" },
    })
  }, 15_000)

  test("canceling a bill with a pending payment leaves it canceled even after that payment is later confirmed", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)

    const billId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Dinner"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(1_000),
      })
    )
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(1_000),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId: cashRegisterAccountId },
      })
    )

    // `cancelBill` does not check the editing lock, so discarding a cart
    // with a still-pending payment attached is allowed — the UI hides this
    // path (the bill page shows the "locked" message instead of the cart
    // once a payment is pending), but the domain guard doesn't forbid it,
    // matching a real cross-device race (one device cancels while another
    // is mid-payment on a different terminal). See docs/bill-payment-states.md.
    await run.orThrow(cancelBill(billId))
    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("canceled")

    await expect(
      run(markPaymentPaidCash({ paymentId, accountId: cashRegisterAccountId }))
    ).resolves.toMatchObject({ ok: true })

    // The claim still landed and still counts toward coverage, but the
    // cancellation is never overridden — the bill stays `canceled`, not
    // force-closed.
    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("canceled")
    await expect(run.ok(loadBillCoverage(billId))).resolves.toMatchObject({
      billTotal: 1_000,
      claimedSum: 1_000,
      coverage: "paid",
    })
  }, 15_000)

  test("a payment canceled after being claimed (a CRDT merge race) still counts toward bill coverage", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)

    const billId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Dinner"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(1_000),
      })
    )
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(1_000),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId: cashRegisterAccountId },
      })
    )
    await expect(
      run(markPaymentPaidCash({ paymentId, accountId: cashRegisterAccountId }))
    ).resolves.toMatchObject({ ok: true })

    // `cancelPayment` itself refuses to cancel an already-claimed payment
    // (see the "rejects canceling a payment that already has an active
    // claim" test), so this state can only be reached the way a real
    // multi-device merge would produce it: a concurrent cancellation write
    // that lands after the claim already did. Simulate that merged state
    // directly rather than going through `cancelPayment`.
    evolu.update("payment", {
      id: paymentId,
      canceledAt: TimestampMsSchema.decode(deps.date.now().getTime()),
    })
    await expect
      .poll(() => evolu.loadQuery(paymentByIdQuery(paymentId)))
      .toSatisfy((rows) => rows[0]?.canceledAt !== null)

    // The payment now displays as canceled, but the money it already
    // claimed still counts — the bill it closed stays `closed`/`paid`, not
    // reverted.
    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("closed")
    await expect(run.ok(loadBillCoverage(billId))).resolves.toMatchObject({
      billTotal: 1_000,
      claimedSum: 1_000,
      coverage: "paid",
    })
  }, 15_000)

  test("the editing lock rejects addCatalogItemToBill, addTipToBill, appendRemoveBillLine, and splitBill the same way it rejects addManualAmountToBill", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)

    const billId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    const existingLine = await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Starter"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(500),
      })
    )
    await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(500),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
      })
    )

    await expect(
      run(
        addCatalogItemToBill({
          billId,
          deviceId: null,
          catalogItemId: "catalog-item-1" as CatalogItemId,
          quantity: PositiveNumber(1),
        })
      )
    ).resolves.toMatchObject({ ok: false, error: { type: "BillLocked" } })

    await expect(
      run(
        addTipToBill({
          billId,
          deviceId: null,
          name: NonEmptyString255("Tip"),
          currency: "CZK",
          totalAmount: NonNegativeInteger(100),
        })
      )
    ).resolves.toMatchObject({ ok: false, error: { type: "BillLocked" } })

    await expect(
      run(
        appendRemoveBillLine({
          billId,
          deviceId: null,
          lineSummary: existingLine,
          quantity: PositiveNumber(1),
          totalAmount: NonNegativeInteger(500),
        })
      )
    ).resolves.toMatchObject({ ok: false, error: { type: "BillLocked" } })

    const otherBillId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(2),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    await expect(
      run(
        splitBill({
          sourceBillId: billId,
          targetBillId: otherBillId,
          items: [existingLine],
        })
      )
    ).resolves.toMatchObject({ ok: false, error: { type: "BillLocked" } })
  }, 15_000)

  test("appendGuardedBillLines rejects a locked bill, unlike the unguarded appendBillLines it replaced in cart undo/redo/clear", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)

    const billId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    const lineSummary = await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Starter"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(500),
      })
    )
    const line = {
      billId,
      deviceId: null,
      catalogItemId: lineSummary.catalogItemId,
      itemId: lineSummary.itemId,
      type: lineSummary.type,
      kind: "remove" as const,
      quantity: lineSummary.quantity,
      totalAmount: lineSummary.totalAmount,
    }

    await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(500),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
      })
    )

    await expect(
      run(appendGuardedBillLines(billId, [line]))
    ).resolves.toMatchObject({ ok: false, error: { type: "BillLocked" } })
    await expect
      .poll(() => run.ok(loadCalculatedBillLineSummaries(billId)))
      .toMatchObject([{ id: lineSummary.id, totalAmount: 500 }])
  }, 15_000)

  test("splitBill rejects a locked target bill even when the source bill is open", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)

    const sourceBillId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    const lineSummary = await run.orThrow(
      addManualAmountToBill({
        billId: sourceBillId,
        deviceId: null,
        name: NonEmptyString255("Shared dish"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(500),
      })
    )

    const targetBillId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(2),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    await run.orThrow(
      createPayment({
        deviceId: null,
        billId: targetBillId,
        tableId: null,
        amount: NonNegativeInteger(1_000),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
      })
    )

    await expect(
      run(
        splitBill({
          sourceBillId,
          targetBillId,
          items: [lineSummary],
        })
      )
    ).resolves.toMatchObject({ ok: false, error: { type: "BillLocked" } })
  }, 15_000)

  test("confirming a payment whose amount exceeds the bill total closes it as overpaid", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)

    const billId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Dinner"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(1_000),
      })
    )
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(1_500),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId: cashRegisterAccountId },
      })
    )

    await expect(
      run(markPaymentPaidCash({ paymentId, accountId: cashRegisterAccountId }))
    ).resolves.toMatchObject({ ok: true })

    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("closed")
    await expect(run.ok(loadBillCoverage(billId))).resolves.toMatchObject({
      billTotal: 1_000,
      claimedSum: 1_500,
      coverage: "overpaid",
    })
  }, 15_000)

  test("a payment's tip amount does not count toward bill coverage", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)

    const billId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Dinner"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(1_000),
      })
    )
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(1_200),
        currency: "CZK",
        tipAmount: NonNegativeInteger(200),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId: cashRegisterAccountId },
      })
    )

    await expect(
      run(markPaymentPaidCash({ paymentId, accountId: cashRegisterAccountId }))
    ).resolves.toMatchObject({ ok: true })

    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("closed")
    await expect(run.ok(loadBillCoverage(billId))).resolves.toMatchObject({
      billTotal: 1_000,
      claimedSum: 1_000,
      coverage: "paid",
    })
  }, 15_000)

  test("a second confirmed split payment re-closes an already-closed bill and updates its coverage", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)

    const billId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Dinner"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(1_000),
      })
    )
    const firstPaymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(1_000),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId: cashRegisterAccountId },
      })
    )
    // A second/split payment created while the bill is still open, and
    // still confirmed after the bill has already closed from the first one.
    const secondPaymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(500),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId: cashRegisterAccountId },
      })
    )

    await expect(
      run(
        markPaymentPaidCash({
          paymentId: firstPaymentId,
          accountId: cashRegisterAccountId,
        })
      )
    ).resolves.toMatchObject({ ok: true })
    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("closed")

    // Confirming the second payment must not be rejected just because the
    // bill already reads `closed` — status is derived live from coverage,
    // not gated by any stored "already closed" field, so a second covering
    // claim is just as welcome as the first (and refreshes the `closedAt`
    // cache idempotently via `loadBillClosedAtIfCovered`).
    await expect(
      run(
        markPaymentPaidCash({
          paymentId: secondPaymentId,
          accountId: cashRegisterAccountId,
        })
      )
    ).resolves.toMatchObject({ ok: true })

    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("closed")
    await expect(run.ok(loadBillCoverage(billId))).resolves.toMatchObject({
      billTotal: 1_000,
      claimedSum: 1_500,
      coverage: "overpaid",
    })
  }, 15_000)

  test("preserves a bill's original closedAt across a later re-close instead of overwriting it", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    let now = new Date("2026-06-05T12:00:00.000Z")
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      date: { now: () => now },
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)

    const billId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Dinner"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(1_000),
      })
    )
    const firstPaymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(1_000),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId: cashRegisterAccountId },
      })
    )
    // Created while the bill is still `open` — `createPayment` would
    // reject a second payment once the bill is `closed`, so this one must
    // be created *before* the first payment below is confirmed.
    const secondPaymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(200),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId: cashRegisterAccountId },
      })
    )

    await expect(
      run(
        markPaymentPaidCash({
          paymentId: firstPaymentId,
          accountId: cashRegisterAccountId,
        })
      )
    ).resolves.toMatchObject({ ok: true })

    const [firstClose] = await evolu.loadQuery(billByIdQuery(billId))
    const firstClosedAt = firstClose?.closedAt
    expect(firstClosedAt).not.toBeNull()

    // The clock advances, and the second (overpaying) payment is confirmed
    // afterward — re-closing the already-`closed` bill idempotently.
    now = new Date(now.getTime() + 60_000)
    await expect(
      run(
        markPaymentPaidCash({
          paymentId: secondPaymentId,
          accountId: cashRegisterAccountId,
        })
      )
    ).resolves.toMatchObject({ ok: true })

    // Still closed, but `closedAt` must stay the *first* close time, not
    // get bumped to the second claim's time.
    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("closed")
    await expect
      .poll(() => evolu.loadQuery(billByIdQuery(billId)))
      .toMatchObject([{ id: billId, closedAt: firstClosedAt }])
  }, 15_000)

  test("concurrently confirming two payments that together cover a bill still closes it correctly", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)

    const billId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Dinner"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(1_000),
      })
    )
    const firstPaymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(600),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId: cashRegisterAccountId },
      })
    )
    const secondPaymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(400),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId: cashRegisterAccountId },
      })
    )

    // Neither payment alone covers the bill, so if the two claims are
    // written concurrently, each write's own pre-write coverage check may
    // only see itself and skip refreshing the `closedAt` cache. That no
    // longer matters for correctness: `loadBillStatus` derives status live
    // from whatever claims exist by the time it's called, not from that
    // cache, so the bill still reads `closed` regardless of which write
    // "saw" the other first. See docs/bill-payment-states.md's "`closedAt`
    // is a cache, not a status".
    const [firstResult, secondResult] = await Promise.all([
      run(
        markPaymentPaidCash({
          paymentId: firstPaymentId,
          accountId: cashRegisterAccountId,
        })
      ),
      run(
        markPaymentPaidCash({
          paymentId: secondPaymentId,
          accountId: cashRegisterAccountId,
        })
      ),
    ])
    expect(firstResult.ok).toBe(true)
    expect(secondResult.ok).toBe(true)

    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("closed")
    await expect(run.ok(loadBillCoverage(billId))).resolves.toMatchObject({
      billTotal: 1_000,
      claimedSum: 1_000,
      coverage: "paid",
    })
  }, 15_000)

  test("createPreparedPayment leaves expiresAt null when no spark method is involved", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      fetch: async () =>
        new Response(
          JSON.stringify({
            BTC: 1_500_000,
            timestamp: 1_700_000_000_000,
          })
        ),
      sparkWallet: {
        create: async () =>
          createFakeSparkWallet({
            createLightningInvoice: async () => {
              throw new Error("Should not be called without a spark method")
            },
          }),
      },
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
      ...createYadioApiDep(),
    } satisfies EvoluDep &
      EvoluOwnerIdDep &
      DateDep &
      FetchDep &
      SparkWalletDep &
      YadioApiDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId, ibanAccountId } =
      await createPaymentAccounts(deps)

    const idResult = await run(
      createPreparedPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        cashRegister: { accountId: cashRegisterAccountId },
        iban: {
          accountId: ibanAccountId,
          variableSymbol: VariableSymbol("1234567890"),
          specificSymbol: null,
        },
      })
    )
    expect(idResult.ok).toBe(true)
    if (!idResult.ok) return

    await expect
      .poll(() => evolu.loadQuery(paymentWithDetailsByIdQuery(idResult.value)))
      .toMatchObject([{ id: idResult.value, expiresAt: null }])
  }, 15_000)

  test("a bill with a zero line-item total is trivially paid once its zero-amount payment is confirmed", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)

    const billId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    // No line items added — the bill's total stays 0 (e.g. fully discounted).
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(0),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId: cashRegisterAccountId },
      })
    )

    await expect(
      run(markPaymentPaidCash({ paymentId, accountId: cashRegisterAccountId }))
    ).resolves.toMatchObject({ ok: true })

    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("closed")
    await expect(run.ok(loadBillCoverage(billId))).resolves.toMatchObject({
      billTotal: 0,
      claimedSum: 0,
      coverage: "paid",
    })
  }, 15_000)
})
