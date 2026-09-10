import { useEffect } from "react"
import {
  saveCashRegisterAccount,
  saveFiatBankAccount,
  saveSparkAccount,
} from "@/core/modules/account/account-actions.ts"
import { cashRegisterAccountId } from "@/core/modules/account/account-utils.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import { completeOnboarding } from "@/core/modules/app-settings/app-settings-actions.ts"
import { cancelBill } from "@/core/modules/bill/bill-actions.ts"
import { billByIdQuery } from "@/core/modules/bill/bill-queries.ts"
import { BillId } from "@/core/modules/bill/bill-types.ts"
import {
  insertBillLineRows,
  loadCalculatedBillLineSummaries,
} from "@/core/modules/bill-line/bill-line-actions.ts"
import { deriveBillSummaryTotal } from "@/core/modules/bill-line/bill-line-utils.ts"
import { upsertItemSnapshot } from "@/core/modules/item/item-actions.ts"
import { createStandaloneItemSnapshot } from "@/core/modules/item/item-utils.ts"
import {
  createPayment,
  markPaymentPaidCash,
} from "@/core/modules/payment/payment-actions.ts"
import {
  paymentIbanDetailsByIdQuery,
  paymentSparkDetailsByIdQuery,
} from "@/core/modules/payment/payment-queries.ts"
import { PaymentId } from "@/core/modules/payment/payment-types.ts"
import {
  claimManualReconciliation,
  reconcileAccountTransaction,
} from "@/core/modules/reconciliation-claim/reconciliation-claim-actions.ts"
import {
  BankAccountInputIbanSchema,
  FiatCurrency,
  NonEmptyString255Schema,
  NonEmptyStringSchema,
  NonNegativeInteger,
  PositiveNumber,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/utils.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"

declare global {
  interface Window {
    __e2eSeedOnboarding?: (options?: {
      readonly spark?: boolean
      readonly fiatCurrency?: FiatCurrency
    }) => Promise<void>
    __e2eMarkSparkPaid?: (paymentId: string) => Promise<void>
    __e2eMarkIbanPaid?: (paymentId: string) => Promise<void>
    __e2eSimulateCancelAfterClaim?: (paymentId: string) => Promise<void>
    __e2eSimulateDuplicateSettlement?: (paymentId: string) => Promise<void>
    __e2eSimulateBillModifiedDuringPayment?: (
      billId: string,
      mode: "add" | "removeAll"
    ) => Promise<void>
    __e2eCreateAndPaySecondPayment?: (billId: string) => Promise<void>
    __e2eCancelBill?: (billId: string) => Promise<void>
  }
}

/**
 * Exposes `window.__e2eSeedOnboarding`, which writes the same account/settings
 * rows the onboarding UI would (cash + IBAN enabled, USD, tips on defaults;
 * pass `{ spark: true }` to also enable Spark, `{ fiatCurrency }` to seed a
 * different currency), so e2e specs can skip clicking through onboarding.
 *
 * Also exposes `window.__e2eMarkSparkPaid`/`window.__e2eMarkIbanPaid`, which
 * simulate an incoming Spark transfer/bank transaction settling a prepared
 * payment: each mirrors what its real sync job does
 * (`spark-account-transaction-sync-job.ts`'s `recordTransfer` /
 * `fio-account-transaction-sync-job.ts`'s `recordTransaction` —
 * `createAccountTransaction` + `reconcileAccountTransaction`) without
 * touching the Spark wallet SDK or a real bank, since there is no
 * counterparty to actually pay/transfer in a test run.
 *
 * Also exposes `window.__e2eSimulateCancelAfterClaim`, which writes
 * `payment.canceledAt` directly (bypassing `cancelPayment`'s guard) on a
 * payment that already has an active claim — simulating the CRDT merge race
 * documented in docs/bill-payment-states.md (one device cancels while
 * another records a claim), the same way `payment-actions.test.ts`'s "a
 * payment canceled after being claimed" test does via a direct
 * `evolu.update` call. Used to exercise the canceled+claimed collision UI
 * (the payment-detail/payment-history warning and
 * `confirmPaymentPaidDespiteCancellation`) without a real second device.
 *
 * Also exposes `window.__e2eSimulateDuplicateSettlement`, which simulates a
 * second offline device independently settling the *same* (already-claimed)
 * payment through its other prepared method — a real account transaction
 * for the payment's IBAN details, claimed via `claimManualReconciliation`
 * rather than `reconcileAccountTransaction`, since the automatic matcher
 * itself excludes a payment that already has a claim (see
 * `ibanReconciliationCandidateByAccountTransactionIdQuery`'s `reconciliationClaim.id
 * is null` guard). A genuine CRDT merge race bypasses that same exclusion
 * for the same reason `__e2eSimulateCancelAfterClaim` does: each device only
 * sees its own writes until sync. Used to exercise the duplicate-settlement
 * collision UI (the payment-detail warning and
 * `acknowledgePaymentExcessSettlement`) without two real devices.
 *
 * Also exposes `window.__e2eSimulateBillModifiedDuringPayment`, which edits
 * a bill's line items directly (bypassing `requireEditableBill`'s lock —
 * the guard only prevents this on the *same* device the pending payment is
 * visible on) — `mode: "add"` appends a manual-amount line, `mode:
 * "removeAll"` inserts a matching "remove" counter-line for every existing
 * one. Simulates the CRDT merge race docs/bill-payment-states.md's "Bill
 * payment coverage" section describes: one device starts a payment against
 * the bill's total at that moment, while another, still offline, edits the
 * bill's lines — once synced, the payment's already-fixed `amount` no
 * longer matches the bill's new total. Used to exercise the underpaid/
 * overpaid coverage note on the payment detail page without two real
 * devices.
 *
 * Also exposes `window.__e2eCreateAndPaySecondPayment`, which creates a
 * *second*, independent payment for `billId` (for its current line-item
 * total, cash) and marks it paid immediately — the real `createPayment`/
 * `markPaymentPaidCash` actions, not a bypass of anything, since split
 * payments are an intended capability (see docs/bill-payment-states.md's
 * "Editing lock" section: creating a new payment deliberately does not
 * check the lock). Used to reach the "two paid payments on one bill, each
 * fully covering it" overpaid case through the bill page's own UI has no
 * way to trigger, since its own "Charge" button disappears once the bill's
 * derived status is no longer `open`.
 *
 * Also exposes `window.__e2eCancelBill`, which calls the real `cancelBill`
 * action directly — the bill-level mirror of the above, letting a test
 * discard a bill while its payment is still pending (a transition the
 * domain guard allows, per docs/bill-payment-states.md, but the bill page's
 * own UI hides the cart's discard button behind the "locked" message once a
 * payment is pending, making it hard to trigger by clicking through the
 * UI). Confirming that same payment afterward produces the canceled+funded
 * bill collision `confirmBillClosedDespiteCancellation` resolves.
 *
 * All eight are dead code in any real production build: kept alive only in
 * dev (`import.meta.env.DEV`) and in the one production build
 * `bun run test:e2e:build` produces via the `PAYKY_E2E_BUILD`-gated
 * `__E2E_TEST_BUILD__` define (see vite.config.ts) — `import.meta.env.DEV`
 * alone is false in every `vite build` output regardless of how it's later
 * served, so it can't gate this for that case.
 */
export function E2eTestBridge() {
  const appRun = useAppRun()

  useEffect(() => {
    if (!import.meta.env.DEV && !__E2E_TEST_BUILD__) return

    window.__e2eSeedOnboarding = async (options) => {
      const sparkEnabled = options?.spark ?? false
      const fiatCurrency = options?.fiatCurrency ?? FiatCurrency.USD
      await using run = appRun()

      await run(
        saveCashRegisterAccount({ enabled: true, currency: fiatCurrency })
      )
      await run(saveSparkAccount({ enabled: sparkEnabled }))
      await run(
        saveFiatBankAccount({
          enabled: true,
          iban: BankAccountInputIbanSchema.parse("CZ6508000000192000145399"),
          currency: fiatCurrency,
        })
      )
      await run(
        completeOnboarding({
          fiatCurrency,
          defaultPaymentMethod: "cashRegister",
          paymentMethodOrderJson: JSON.stringify(
            sparkEnabled
              ? ["spark", "iban", "cashRegister"]
              : ["iban", "cashRegister"]
          ),
        })
      )
    }

    window.__e2eMarkSparkPaid = async (paymentIdValue) => {
      const parsedPaymentId = PaymentId.parse(paymentIdValue)
      await using run = appRun()

      const [sparkDetails] = await run.deps.evolu.loadQuery(
        paymentSparkDetailsByIdQuery(parsedPaymentId)
      )
      if (!sparkDetails) {
        throw new Error(
          `No prepared Spark payment found for payment ${parsedPaymentId}.`
        )
      }

      const accountTransactionId = await run.ok(
        createAccountTransaction({
          accountId: sparkDetails.accountId,
          amount: sparkDetails.amountSats,
          currency: "BTC",
          occurredAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
          note: null,
          internalTransferGroupId: null,
          source: { deviceId: null, source: "auto" },
          spark: {
            sparkTransferId: NonEmptyStringSchema.decode(
              `e2e:${parsedPaymentId}`
            ),
            ...(sparkDetails.lnInvoice === null
              ? {}
              : {
                  lightning: {
                    lnInvoice: NonEmptyStringSchema.decode(
                      sparkDetails.lnInvoice
                    ),
                    preImage: null,
                    paymentHash: null,
                  },
                }),
            ...(sparkDetails.sparkInvoice === null
              ? {}
              : {
                  sparkInvoice: {
                    sparkInvoice: NonEmptyStringSchema.decode(
                      sparkDetails.sparkInvoice
                    ),
                  },
                }),
          },
        })
      )

      await run.ok(reconcileAccountTransaction(accountTransactionId))
    }

    window.__e2eMarkIbanPaid = async (paymentIdValue) => {
      const parsedPaymentId = PaymentId.parse(paymentIdValue)
      await using run = appRun()

      const [ibanDetails] = await run.deps.evolu.loadQuery(
        paymentIbanDetailsByIdQuery(parsedPaymentId)
      )
      if (!ibanDetails) {
        throw new Error(
          `No prepared IBAN payment found for payment ${parsedPaymentId}.`
        )
      }

      const accountTransactionId = await run.ok(
        createAccountTransaction({
          accountId: ibanDetails.accountId,
          amount: ibanDetails.amount,
          currency: ibanDetails.currency,
          occurredAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
          note: null,
          internalTransferGroupId: null,
          source: { deviceId: null, source: "auto" },
          iban: {
            variableSymbol: ibanDetails.variableSymbol,
            constantSymbol: null,
            specificSymbol: ibanDetails.specificSymbol,
            bankReference: NonEmptyString255Schema.decode(
              `e2e:${parsedPaymentId}`
            ),
          },
        })
      )

      await run.ok(reconcileAccountTransaction(accountTransactionId))
    }

    window.__e2eSimulateCancelAfterClaim = async (paymentIdValue) => {
      const parsedPaymentId = PaymentId.parse(paymentIdValue)
      await using run = appRun()
      const { evoluOwnerId } = run.deps

      await runMutationWithCompletion((options) =>
        run.deps.evolu.update(
          "payment",
          {
            id: parsedPaymentId,
            canceledAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
          },
          { ...options, ownerId: evoluOwnerId }
        )
      )
    }

    window.__e2eSimulateDuplicateSettlement = async (paymentIdValue) => {
      const parsedPaymentId = PaymentId.parse(paymentIdValue)
      await using run = appRun()

      const [ibanDetails] = await run.deps.evolu.loadQuery(
        paymentIbanDetailsByIdQuery(parsedPaymentId)
      )
      if (!ibanDetails) {
        throw new Error(
          `No prepared IBAN payment found for payment ${parsedPaymentId}.`
        )
      }

      const accountTransactionId = await run.ok(
        createAccountTransaction({
          accountId: ibanDetails.accountId,
          amount: ibanDetails.amount,
          currency: ibanDetails.currency,
          occurredAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
          note: null,
          internalTransferGroupId: null,
          source: { deviceId: null, source: "auto" },
          iban: {
            variableSymbol: ibanDetails.variableSymbol,
            constantSymbol: null,
            specificSymbol: ibanDetails.specificSymbol,
            bankReference: NonEmptyString255Schema.decode(
              `e2e:duplicate:${parsedPaymentId}`
            ),
          },
        })
      )

      await run.ok(
        claimManualReconciliation({
          paymentId: parsedPaymentId,
          accountTransactionId,
          deviceId: null,
        })
      )
    }

    window.__e2eSimulateBillModifiedDuringPayment = async (
      billIdValue,
      mode
    ) => {
      const parsedBillId = BillId.parse(billIdValue)
      await using run = appRun()
      const { evoluOwnerId } = run.deps

      if (mode === "add") {
        const [billRow] = await run.deps.evolu.loadQuery(
          billByIdQuery(parsedBillId)
        )
        if (!billRow) {
          throw new Error(`Bill ${parsedBillId} not found.`)
        }

        const snapshot = createStandaloneItemSnapshot({
          catalogItemId: null,
          name: NonEmptyString255Schema.decode("e2e: concurrent addition"),
          description: null,
          currency: billRow.currency,
          unitAmount: NonNegativeInteger(300),
          taxRateId: null,
        })

        await runMutationWithCompletion((options) => {
          upsertItemSnapshot(run.deps.evolu, snapshot, {
            ...options,
            ownerId: evoluOwnerId,
          })
          insertBillLineRows(
            run.deps.evolu,
            [
              {
                billId: parsedBillId,
                deviceId: null,
                catalogItemId: null,
                itemId: snapshot.id,
                type: "manualAmount",
                kind: "add",
                quantity: PositiveNumber(1),
                totalAmount: NonNegativeInteger(300),
              },
            ],
            { ...options, ownerId: evoluOwnerId }
          )
        })
        return
      }

      const summaries = await run.ok(
        loadCalculatedBillLineSummaries(parsedBillId)
      )
      await runMutationWithCompletion((options) => {
        insertBillLineRows(
          run.deps.evolu,
          summaries.map((summary) => ({
            billId: parsedBillId,
            deviceId: null,
            catalogItemId: summary.catalogItemId,
            itemId: summary.itemId,
            type: summary.type,
            kind: "remove" as const,
            quantity: summary.quantity,
            totalAmount: summary.totalAmount,
          })),
          { ...options, ownerId: evoluOwnerId }
        )
      })
    }

    window.__e2eCreateAndPaySecondPayment = async (billIdValue) => {
      const parsedBillId = BillId.parse(billIdValue)
      await using run = appRun()

      const [billRow] = await run.deps.evolu.loadQuery(
        billByIdQuery(parsedBillId)
      )
      if (!billRow) {
        throw new Error(`Bill ${parsedBillId} not found.`)
      }

      const summaries = await run.ok(
        loadCalculatedBillLineSummaries(parsedBillId)
      )
      const totalAmount = deriveBillSummaryTotal(summaries)

      const paymentResult = await run(
        createPayment({
          deviceId: null,
          billId: parsedBillId,
          tableId: null,
          amount: totalAmount,
          currency: billRow.currency,
          tipAmount: NonNegativeInteger(0),
          canceledAt: null,
          expiresAt: null,
          cashRegister: { accountId: cashRegisterAccountId },
        })
      )
      if (!paymentResult.ok) {
        throw new Error(
          `Failed to create a second payment for bill ${parsedBillId}: ${paymentResult.error.type}`
        )
      }

      const payResult = await run(
        markPaymentPaidCash({
          paymentId: paymentResult.value,
          accountId: cashRegisterAccountId,
        })
      )
      if (!payResult.ok) {
        throw new Error(
          `Failed to pay the second payment for bill ${parsedBillId}: ${payResult.error.type}`
        )
      }
    }

    window.__e2eCancelBill = async (billIdValue) => {
      const parsedBillId = BillId.parse(billIdValue)
      await using run = appRun()

      const result = await run(cancelBill(parsedBillId))
      if (!result.ok) {
        throw new Error(
          `Failed to cancel bill ${parsedBillId}: ${result.error.type}`
        )
      }
    }

    return () => {
      delete window.__e2eSeedOnboarding
      delete window.__e2eMarkSparkPaid
      delete window.__e2eMarkIbanPaid
      delete window.__e2eSimulateCancelAfterClaim
      delete window.__e2eSimulateDuplicateSettlement
      delete window.__e2eSimulateBillModifiedDuringPayment
      delete window.__e2eCreateAndPaySecondPayment
      delete window.__e2eCancelBill
    }
  }, [appRun])

  return null
}
