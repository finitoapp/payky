import { err, ok, type Task } from "@evolu/common"
import type { DateDep, EvoluOwnerDep, FetchDep } from "../../deps.ts"
import { fetchLnurlVerify } from "../../integrations/lnurl/lnurl-pay-client.ts"
import {
  computeAccountTransactionRows,
  upsertAccountTransactionRows,
} from "../account-transaction/account-transaction-actions.ts"
import type { DeviceId } from "../device/device-types.ts"
import {
  loadBillClosedAtForPayment,
  upsertReconciliationClaimRows,
} from "../reconciliation-claim/reconciliation-claim-actions.ts"
import { createAutomaticReconciliationClaim } from "../reconciliation-claim/reconciliation-claim-utils.ts"
import type { EvoluDep } from "../shared/evolu-deps.ts"
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import {
  parseLightningInvoice,
  verifyLightningPreimage,
} from "../shared/lightning-invoice-utils.ts"
import { NonEmptyStringSchema, TimestampMsSchema } from "../shared/schema.ts"
import {
  createLightningAddressVerifyMismatchError,
  createPaymentLightningAddressNotFoundError,
  type SyncLightningAddressPaymentError,
} from "./payment-errors.ts"
import { loadPaymentHasActiveClaim } from "./payment-guards.ts"
import { paymentLightningAddressByIdQuery } from "./payment-queries.ts"
import type { PaymentId } from "./payment-types.ts"

/**
 * - `paid`: settled, now or before, or claimed by another method meanwhile.
 * - `pending`: the wallet has not been paid yet.
 * - `unverified`: the wallet says paid but gave no preimage that proves it,
 *   so nothing is written (lightning-address/0002).
 */
export type LightningAddressPaymentStatus = "paid" | "pending" | "unverified"

/**
 * One poll of a Lightning address payment's LUD-21 verify URL, by the wait
 * screen or the verify job on any device (lightning-address/0005).
 *
 * The payment counts as paid only when the wallet answers for the very
 * invoice Payky stored and reveals a preimage whose SHA-256 is its payment
 * hash; `settled` alone is not enough (lightning-address/0002). The account
 * transaction, its claim and the preimage are then written in one batch,
 * under ids derived from the payment hash, so two devices that both saw it
 * write the same rows. There is no status guard: the money is already in
 * the merchant's wallet, so a payment canceled or expired meanwhile ends up
 * claimed, the collision payment/0004 describes.
 */
export const syncLightningAddressPayment =
  ({
    paymentId,
    deviceId = null,
  }: {
    readonly paymentId: PaymentId
    readonly deviceId?: DeviceId | null
  }): Task<
    LightningAddressPaymentStatus,
    SyncLightningAddressPaymentError,
    EvoluDep & EvoluOwnerDep & DateDep & FetchDep
  > =>
  async (run) => {
    const { evolu, evoluOwner } = run.deps
    const [[detail], hasActiveClaim] = await Promise.all([
      evolu.loadQuery(paymentLightningAddressByIdQuery(paymentId)),
      run.ok(loadPaymentHasActiveClaim(paymentId)),
    ])
    if (detail === undefined) {
      return err(createPaymentLightningAddressNotFoundError({ id: paymentId }))
    }
    if (detail.preimage !== null || hasActiveClaim) return ok("paid")

    const verify = await run(fetchLnurlVerify({ verifyUrl: detail.verifyUrl }))
    if (!verify.ok) return verify

    // Compared as `parseLightningInvoice` normalizes it: lowercase, no scheme.
    const answeredFor = parseLightningInvoice(verify.value.pr)
    if (!answeredFor.ok || answeredFor.value.invoice !== detail.lnInvoice) {
      return err(createLightningAddressVerifyMismatchError({ id: paymentId }))
    }
    if (!verify.value.settled) return ok("pending")

    const { preimage } = verify.value
    if (
      preimage === null ||
      !verifyLightningPreimage({ preimage, paymentHash: detail.paymentHash })
    ) {
      return ok("unverified")
    }

    const now = run.deps.date.now()
    const accountTransaction = computeAccountTransactionRows(
      {
        accountId: detail.accountId,
        amount: detail.amountSats,
        currency: "BTC",
        occurredAt: TimestampMsSchema.decode(now.getTime()),
        note: null,
        internalTransferGroupId: null,
        source: { deviceId, source: "auto" },
        lightning: {
          lnInvoice: detail.lnInvoice,
          paymentHash: detail.paymentHash,
          preImage: NonEmptyStringSchema.decode(preimage.trim().toLowerCase()),
        },
      },
      now
    )
    const claim = createAutomaticReconciliationClaim(
      paymentId,
      accountTransaction.id,
      now
    )
    const billClosing = await run.ok(
      loadBillClosedAtForPayment(paymentId, {
        id: accountTransaction.id,
        kind: accountTransaction.kind,
        amount: accountTransaction.input.amount,
        currency: accountTransaction.input.currency,
      })
    )

    await runMutationWithCompletion((options) => {
      const mutationOptions = { ...options, owner: evoluOwner }
      upsertAccountTransactionRows(evolu, accountTransaction, mutationOptions)
      upsertReconciliationClaimRows(evolu, claim, billClosing, mutationOptions)
      evolu.update(
        "paymentLightningAddress",
        {
          id: paymentId,
          preimage: NonEmptyStringSchema.decode(preimage.trim().toLowerCase()),
        },
        mutationOptions
      )
    })

    return ok("paid")
  }
