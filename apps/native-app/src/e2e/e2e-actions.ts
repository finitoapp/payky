import { accessLastActivityAtom } from "@payky/app-shared/access-state"
import {
  accountListQuery,
  updateDeviceSettings,
} from "@payky/core/evolu/device-account"
import { getDeviceLocaleForLanguage } from "@payky/core/evolu/device-client"
import {
  saveCashRegisterAccount,
  saveFiatBankAccount,
  saveSparkAccount,
} from "@payky/core/modules/account/account-actions"
import { createCashRegisterAccountId } from "@payky/core/modules/account/account-utils"
import { createAccountTransaction } from "@payky/core/modules/account-transaction/account-transaction-actions"
import { completeOnboarding } from "@payky/core/modules/app-settings/app-settings-actions"
import { PaymentMethodOrderJson } from "@payky/core/modules/app-settings/app-settings-utils"
import { cancelBill } from "@payky/core/modules/bill/bill-actions"
import {
  billByIdQuery,
  latestBillsQuery,
} from "@payky/core/modules/bill/bill-queries"
import { BillId } from "@payky/core/modules/bill/bill-types"
import {
  insertBillLineRows,
  loadCalculatedBillLineSummaries,
} from "@payky/core/modules/bill-line/bill-line-actions"
import { deriveBillSummaryTotal } from "@payky/core/modules/bill-line/bill-line-utils"
import {
  registerDevice,
  setDevicePinBlocked,
  unblockDevice,
} from "@payky/core/modules/device/device-actions"
import { deviceByIdQuery } from "@payky/core/modules/device/device-queries"
import { DeviceId } from "@payky/core/modules/device/device-types"
import { upsertItemSnapshot } from "@payky/core/modules/item/item-actions"
import { createStandaloneItemSnapshot } from "@payky/core/modules/item/item-utils"
import {
  createPayment,
  markPaymentPaidCash,
} from "@payky/core/modules/payment/payment-actions"
import {
  latestPaymentsQuery,
  paymentIbanDetailsByIdQuery,
  paymentSparkDetailsByIdQuery,
} from "@payky/core/modules/payment/payment-queries"
import { PaymentId } from "@payky/core/modules/payment/payment-types"
import {
  claimManualReconciliation,
  reconcileAccountTransaction,
} from "@payky/core/modules/reconciliation-claim/reconciliation-claim-actions"
import {
  createRowId,
  runMutationWithCompletion,
} from "@payky/core/modules/shared/evolu-utils"
import {
  BankAccountInputIbanSchema,
  FiatCurrency,
  NonEmptyString255,
  NonEmptyString255Schema,
  NonEmptyStringSchema,
  NonNegativeInteger,
  PositiveNumber,
  TimestampMsSchema,
} from "@payky/core/modules/shared/schema"
import type { createStore } from "jotai"
import type { SetStateAction } from "react"
import { z } from "zod"
import type { NativeAppRun } from "../hooks/use-app-run.ts"

/**
 * What a flow opens `/e2e/<action>?<params>` for: the native twin of web's
 * `window.__e2e*` functions (`e2e-test-bridge.tsx`), since Maestro cannot call
 * into the app. An action reads its params with zod, throws on failure, and
 * may return a value the bridge page prints for `assertVisible`. `context`
 * is what only a component can read (the active device).
 */
export interface E2eContext {
  readonly deviceId: DeviceId
  readonly store: ReturnType<typeof createStore>
}

type E2eAction = (
  run: NativeAppRun,
  params: Readonly<Record<string, string>>,
  context: E2eContext
) => Promise<string | undefined>

const SeedOnboardingParams = z.object({
  spark: z.stringbool().default(false),
  fiatCurrency: z.enum(FiatCurrency).default(FiatCurrency.USD),
})

export const e2eActions: Readonly<Record<string, E2eAction>> = {
  ping: async () => undefined,

  /**
   * `__e2eSeedOnboarding`: the rows the onboarding UI writes (cash + IBAN,
   * USD, tips on defaults; `spark=true` adds Spark, `fiatCurrency=` another
   * currency), plus English, so no flow depends on the device locale.
   */
  seedOnboarding: async (run, params) => {
    const { spark, fiatCurrency } = SeedOnboardingParams.parse(params)
    updateDeviceSettings(run.deps.deviceEvolu, {
      language: "en",
      locale: getDeviceLocaleForLanguage("en"),
    })
    await run.ok(
      saveCashRegisterAccount({ enabled: true, currency: fiatCurrency })
    )
    await run.ok(saveSparkAccount({ enabled: spark }))
    await run.ok(
      saveFiatBankAccount({
        enabled: true,
        iban: BankAccountInputIbanSchema.parse("CZ6508000000192000145399"),
        currency: fiatCurrency,
      })
    )
    await run.orThrow(
      completeOnboarding({
        fiatCurrency,
        defaultPaymentMethod: "cashRegister",
        paymentMethodOrderJson: z.encode(
          PaymentMethodOrderJson,
          spark ? ["spark", "iban", "cashRegister"] : ["iban", "cashRegister"]
        ),
      })
    )
    return undefined
  },

  /**
   * One warning through the run's console (a release build keeps warnings and
   * up), so the debug console has an entry: web's spec reads the ones
   * onboarding logged, which the seed's relaunch clears on native.
   */
  log: async (run) => {
    run.deps.console.warn("e2e log")
    return undefined
  },

  /**
   * The ids web's specs read off the URL (`/bill?billId=`, `/payment/<id>`),
   * which a flow cannot: the newest bill's and payment's, printed as
   * `bill=<id> payment=<id>` (`-` for none). `subflows/read-ids.yaml` keeps
   * them as `output.billId` and `output.paymentId`.
   */
  lastIds: async (run) => {
    const [bill] = await run.deps.evolu.loadQuery(latestBillsQuery(1))
    const [payment] = await run.deps.evolu.loadQuery(latestPaymentsQuery(1))
    return `bill=${bill?.id ?? "-"} payment=${payment?.id ?? "-"}`
  },

  /**
   * `__e2eMarkSparkPaid`: settles `paymentId`'s prepared Spark invoice the way
   * the sync job would, without a real wallet.
   */
  markSparkPaid: async (run, params) => {
    const paymentId = PaymentId.parse(params.paymentId)
    const [sparkDetails] = await run.deps.evolu.loadQuery(
      paymentSparkDetailsByIdQuery(paymentId)
    )
    if (!sparkDetails) {
      throw new Error(
        `No prepared Spark payment found for payment ${paymentId}.`
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
          sparkTransferId: NonEmptyStringSchema.decode(`e2e:${paymentId}`),
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
    return undefined
  },

  /** `__e2eMarkIbanPaid`: the bank transfer arrives for `paymentId`. */
  markIbanPaid: async (run, params) => {
    const paymentId = PaymentId.parse(params.paymentId)
    const accountTransactionId = await createIbanTransaction(
      run,
      paymentId,
      `e2e:${paymentId}`
    )
    await run.ok(reconcileAccountTransaction(accountTransactionId))
    return undefined
  },

  /**
   * `__e2eSimulateCancelAfterClaim`: a CRDT merge race cancels the
   * already-claimed `paymentId` directly, bypassing `cancelPayment`'s guard,
   * so it ends up canceled+claimed.
   */
  simulateCancelAfterClaim: async (run, params) => {
    const paymentId = PaymentId.parse(params.paymentId)
    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "payment",
        {
          id: paymentId,
          canceledAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
        },
        { ...options, owner: run.deps.evoluOwner }
      )
    )
    return undefined
  },

  /**
   * `__e2eSimulateDuplicateSettlement`: a second offline device settles the
   * cash-claimed `paymentId` again through its prepared IBAN details, so it
   * is claimed for more than its own amount.
   */
  simulateDuplicateSettlement: async (run, params) => {
    const paymentId = PaymentId.parse(params.paymentId)
    const accountTransactionId = await createIbanTransaction(
      run,
      paymentId,
      `e2e:duplicate:${paymentId}`
    )
    await run.ok(
      claimManualReconciliation({
        paymentId,
        accountTransactionId,
        deviceId: null,
      })
    )
    return undefined
  },

  /**
   * `__e2eSimulateBillModifiedDuringPayment`: another, still-offline device
   * edits `billId`'s lines while a payment is in flight. `mode=add` grows the
   * total past the payment's fixed amount (underpaid once claimed),
   * `mode=removeAll` shrinks it below (overpaid).
   */
  simulateBillModifiedDuringPayment: async (run, params) => {
    const billId = BillId.parse(params.billId)
    const owner = { owner: run.deps.evoluOwner }
    if (params.mode === "add") {
      const [billRow] = await run.deps.evolu.loadQuery(billByIdQuery(billId))
      if (!billRow) throw new Error(`Bill ${billId} not found.`)
      const snapshot = createStandaloneItemSnapshot({
        catalogItemId: null,
        name: NonEmptyString255Schema.decode("e2e: concurrent addition"),
        description: null,
        currency: billRow.currency,
        unitAmount: NonNegativeInteger(300),
        taxRateId: null,
      })
      await runMutationWithCompletion((options) => {
        upsertItemSnapshot(run.deps.evolu, snapshot, { ...options, ...owner })
        insertBillLineRows(
          run.deps.evolu,
          [
            {
              billId,
              deviceId: null,
              catalogItemId: null,
              itemId: snapshot.id,
              type: "manualAmount",
              kind: "add",
              quantity: PositiveNumber(1),
              totalAmount: NonNegativeInteger(300),
            },
          ],
          { ...options, ...owner }
        )
      })
      return undefined
    }
    const summaries = await run.ok(loadCalculatedBillLineSummaries(billId))
    await runMutationWithCompletion((options) => {
      insertBillLineRows(
        run.deps.evolu,
        summaries.map((summary) => ({
          billId,
          deviceId: null,
          catalogItemId: summary.catalogItemId,
          itemId: summary.itemId,
          type: summary.type,
          kind: "remove" as const,
          quantity: summary.quantity,
          totalAmount: summary.totalAmount,
        })),
        { ...options, ...owner }
      )
    })
    return undefined
  },

  /**
   * `__e2eCreateAndPaySecondPayment`: a second, independent cash payment for
   * `billId`, created and paid with the real actions — what a concurrent
   * device could do before either claim arrives.
   */
  createAndPaySecondPayment: async (run, params, { deviceId }) => {
    const billId = BillId.parse(params.billId)
    const [billRow] = await run.deps.evolu.loadQuery(billByIdQuery(billId))
    if (!billRow) throw new Error(`Bill ${billId} not found.`)
    const summaries = await run.ok(loadCalculatedBillLineSummaries(billId))
    // The cash register `seedOnboarding` enabled, in the bill's currency.
    const accountId = createCashRegisterAccountId(billRow.currency)
    const paymentId = await run.orThrow(
      createPayment({
        deviceId,
        billId,
        tableId: null,
        amount: deriveBillSummaryTotal(summaries),
        currency: billRow.currency,
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId },
      })
    )
    await run.orThrow(markPaymentPaidCash({ paymentId, accountId }))
    return undefined
  },

  /**
   * `__e2eSeedDevice`: a second device that synced in (`name=`, `blocked=`),
   * printed as `id=<id>`.
   */
  seedDevice: async (run, params) => {
    const id = createRowId<"Device">()
    await run.ok(
      registerDevice({
        id,
        name: NonEmptyString255(params.name ?? "Kitchen tablet"),
        deviceType: NonEmptyString255("tablet"),
        browserName: null,
        osName: NonEmptyString255("Android"),
      })
    )
    if (params.blocked === "true") {
      await run.ok(setDevicePinBlocked({ id, blocked: true }))
    }
    return `id=${id}`
  },

  /**
   * `__e2eReadDevice`: whether `id` carries an unblock token, printed as
   * `token=yes` or `token=no` (the token itself is not for a screen).
   */
  readDevice: async (run, params) => {
    const [row] = await run.deps.evolu.loadQuery(
      deviceByIdQuery(DeviceId.parse(params.id))
    )
    return `token=${row?.pinUnblockToken ? "yes" : "no"}`
  },

  /**
   * `__e2eDeviceAccountIds`: the device's account ids, oldest first, printed
   * as `count=<n> first=<id>`.
   */
  deviceAccountIds: async (run) => {
    const accounts = await run.deps.deviceEvolu.loadQuery(accountListQuery)
    return `count=${accounts.length} first=${accounts[0]?.id ?? "-"}`
  },

  /** `__e2eUnblockThisDevice`: another device's unblock reaching this one. */
  unblockThisDevice: async (run, _params, { deviceId }) => {
    await run.ok(unblockDevice(deviceId))
    return undefined
  },

  /**
   * Stands in for web's `page.clock.fastForward("05:10")` (native-e2e.md 4.5):
   * the PIN session's last activity moves back six minutes, so the watcher's
   * next tick (5 s) ends it. Needs the session to survive the link, which web
   * does not (every link reloads the page): Android only.
   */
  idleSession: async (_run, _params, { store }) => {
    const now: number = Date.now()
    store.set<number, [SetStateAction<number>], void>(
      accessLastActivityAtom,
      now - 6 * 60 * 1000
    )
    return undefined
  },

  /**
   * `__e2eCancelBill`: the real `cancelBill`, called directly because the
   * bill page hides the discard button while a payment is pending, which the
   * domain guard allows.
   */
  cancelBill: async (run, params) => {
    await run.orThrow(cancelBill(BillId.parse(params.billId)))
    return undefined
  },
}

/** An IBAN account transaction matching `paymentId`'s prepared details. */
async function createIbanTransaction(
  run: NativeAppRun,
  paymentId: PaymentId,
  bankReference: string
) {
  const [ibanDetails] = await run.deps.evolu.loadQuery(
    paymentIbanDetailsByIdQuery(paymentId)
  )
  if (!ibanDetails) {
    throw new Error(`No prepared IBAN payment found for payment ${paymentId}.`)
  }
  return run.ok(
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
        bankReference: NonEmptyString255Schema.decode(bankReference),
      },
    })
  )
}
