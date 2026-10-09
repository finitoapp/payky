import {
  type ConsoleDep,
  err,
  type LockManagerDep,
  ok,
  type Result,
  type Task,
} from "@evolu/common"
import type { DateDep, EvoluOwnerIdDep, FetchDep } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import type { LnurlError } from "@/core/integrations/lnurl/lnurl-client.ts"
import {
  fetchLnurlPayInvoice,
  fetchLnurlPayMetadata,
  type LightningAddressInvoiceMismatchError,
} from "@/core/integrations/lnurl/lnurl-pay-client.ts"
import { activeSparkAccountByIdQuery } from "@/core/modules/account/account-spark-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import {
  computeAccountTransactionRows,
  deriveSparkAccountTransactionId,
  upsertAccountTransactionRows,
} from "@/core/modules/account-transaction/account-transaction-actions.ts"
import { accountTransactionExistsQuery } from "@/core/modules/account-transaction/account-transaction-queries.ts"
import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import { paymentIdsByLnInvoiceQuery } from "@/core/modules/payment/payment-queries.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  createRowId,
  runMutationWithCompletion,
} from "@/core/modules/shared/evolu-utils.ts"
import type { LightningInvoice } from "@/core/modules/shared/lightning-invoice-utils.ts"
import {
  type BitcoinAddress,
  Integer,
  type NonEmptyString,
  NonEmptyStringSchema,
  NonNegativeInteger,
  PositiveInteger,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import type {
  SparkExitSpeed,
  SparkPaymentWallet,
  SparkWalletDep,
  SparkWithdrawalFeeQuote,
} from "@/core/spark/spark-wallet.ts"
import type { WithdrawDestination } from "./withdraw-destination-utils.ts"
import { withdrawalForResolutionQuery } from "./withdraw-queries.ts"
import type { WithdrawalFailureReason, WithdrawalId } from "./withdraw-types.ts"
import {
  lightningMaxFeeSats,
  ONCHAIN_WITHDRAWAL_MIN_SATS,
  onchainWithdrawAllAmountSats,
  WITHDRAWAL_QUOTE_EXPIRY_MARGIN_MS,
  withdrawalRecipientSats,
} from "./withdraw-utils.ts"

export interface OnchainWithdrawalQuote {
  readonly kind: "onchain"
  readonly onchainAddress: BitcoinAddress
  readonly availableSats: number
  /** The requested amount; for "withdraw all" the balance the fee comes out of. */
  readonly amountSats: number
  readonly withdrawAll: boolean
  readonly feeQuote: SparkWithdrawalFeeQuote
}

export interface LightningWithdrawalQuote {
  readonly kind: "lightning"
  readonly availableSats: number
  /** The invoice to pay; for a Lightning address, the one it returned. */
  readonly invoice: LightningInvoice
  readonly lightningAddress: string | null
  /** The recipient's own text: `text/plain` from LNURL metadata, or the invoice's description. */
  readonly recipientText: string | null
  /** What the recipient gets. */
  readonly amountSats: number
  /** Set only for an amountless invoice. */
  readonly amountSatsToSend: number | undefined
  readonly withdrawAll: boolean
  readonly maxFeeSats: number
  /** A UUID, minted per quote: the Spark transfer's id once paid. */
  readonly transferId: string
}

export type WithdrawalQuote = OnchainWithdrawalQuote | LightningWithdrawalQuote

export type SupportedWithdrawDestination = Exclude<
  WithdrawDestination,
  { readonly kind: "unsupported" }
>

const createWithdrawalAccountNotFoundError = defineError(
  "WithdrawalAccountNotFound"
)<{
  readonly accountId: AccountId
}>()
export type WithdrawalAccountNotFoundError = ReturnType<
  typeof createWithdrawalAccountNotFoundError
>

const createInsufficientWithdrawalBalanceError = defineError(
  "InsufficientWithdrawalBalance"
)<{
  readonly availableSats: number
  readonly requestedSats: number
  /** The most a Lightning address withdrawal could send, after its fee reserve. */
  readonly maxSendableSats?: number
}>()
export type InsufficientWithdrawalBalanceError = ReturnType<
  typeof createInsufficientWithdrawalBalanceError
>

const createWithdrawalAmountOutOfRangeError = defineError(
  "WithdrawalAmountOutOfRange"
)<{
  readonly minSats: number
  readonly maxSats: number
}>()
export type WithdrawalAmountOutOfRangeError = ReturnType<
  typeof createWithdrawalAmountOutOfRangeError
>

const createWithdrawalBelowMinimumError = defineError(
  "WithdrawalBelowMinimum"
)<{
  readonly minSats: number
}>()
export type WithdrawalBelowMinimumError = ReturnType<
  typeof createWithdrawalBelowMinimumError
>

const createWithdrawalAmountRequiredError = defineError(
  "WithdrawalAmountRequired"
)()
export type WithdrawalAmountRequiredError = ReturnType<
  typeof createWithdrawalAmountRequiredError
>

const createWithdrawalQuoteFailedError = defineError("WithdrawalQuoteFailed")<{
  readonly message: string
}>()
export type WithdrawalQuoteFailedError = ReturnType<
  typeof createWithdrawalQuoteFailedError
>

const createSelfWithdrawalError = defineError("SelfWithdrawal")()
export type SelfWithdrawalError = ReturnType<typeof createSelfWithdrawalError>

const createLightningInvoiceExpiredError = defineError(
  "LightningInvoiceExpired"
)()
export type LightningInvoiceExpiredError = ReturnType<
  typeof createLightningInvoiceExpiredError
>

const createWithdrawalQuoteExpiredError = defineError(
  "WithdrawalQuoteExpired"
)()
export type WithdrawalQuoteExpiredError = ReturnType<
  typeof createWithdrawalQuoteExpiredError
>

/** The SDK refused a Lightning payment and no transfer exists: the money did not leave. */
const createWithdrawalRejectedError = defineError("WithdrawalRejected")<{
  readonly withdrawalId: WithdrawalId
}>()
export type WithdrawalRejectedError = ReturnType<
  typeof createWithdrawalRejectedError
>

/** The withdrawal was recorded, but whether money left is not known yet. */
const createWithdrawalOutcomeUnknownError = defineError(
  "WithdrawalOutcomeUnknown"
)<{
  readonly withdrawalId: WithdrawalId
}>()
export type WithdrawalOutcomeUnknownError = ReturnType<
  typeof createWithdrawalOutcomeUnknownError
>

// `id`, not `withdrawalId`: that key is reserved for the errors above, whose
// withdrawal does exist (see `executeWithdrawal`).
const createWithdrawalNotFoundError = defineError("WithdrawalNotFound")<{
  readonly id: WithdrawalId
}>()
export type WithdrawalNotFoundError = ReturnType<
  typeof createWithdrawalNotFoundError
>

export type QuoteWithdrawalError =
  | WithdrawalAccountNotFoundError
  | InsufficientWithdrawalBalanceError
  | WithdrawalAmountOutOfRangeError
  | WithdrawalBelowMinimumError
  | WithdrawalAmountRequiredError
  | WithdrawalQuoteFailedError
  | SelfWithdrawalError
  | LightningInvoiceExpiredError
  | LightningAddressInvoiceMismatchError
  | LnurlError

/** Errors that come back before anything is recorded: the review stays open. */
export type ExecuteWithdrawalEarlyError =
  | WithdrawalAccountNotFoundError
  | InsufficientWithdrawalBalanceError
  | LightningInvoiceExpiredError
  | WithdrawalQuoteExpiredError
  | WithdrawalBelowMinimumError

export type ExecuteWithdrawalError =
  | ExecuteWithdrawalEarlyError
  | WithdrawalRejectedError
  | WithdrawalOutcomeUnknownError

const loadSparkAccount = async (
  evolu: EvoluDep["evolu"],
  accountId: AccountId
) => {
  const [sparkAccount] = await evolu.loadQuery(
    activeSparkAccountByIdQuery(accountId)
  )
  return sparkAccount
}

const isExpired = (expiresAt: number, now: Date): boolean =>
  expiresAt - WITHDRAWAL_QUOTE_EXPIRY_MARGIN_MS <= now.getTime()

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback

/** withdraw/0006: neither our own wallet nor one of our own payment invoices. */
const isSelfWithdrawal = async (
  evolu: EvoluDep["evolu"],
  wallet: SparkPaymentWallet,
  invoice: LightningInvoice
): Promise<boolean> => {
  if (
    invoice.sparkFallbackIdentity !== null &&
    invoice.sparkFallbackIdentity === (await wallet.getIdentityPublicKey())
  ) {
    return true
  }
  const payments = await evolu.loadQuery(
    paymentIdsByLnInvoiceQuery(NonEmptyStringSchema.decode(invoice.invoice))
  )
  return payments.length > 0
}

type QuoteResult = Result<WithdrawalQuote, QuoteWithdrawalError>

const quoteOnchain = async ({
  wallet,
  onchainAddress,
  amountSats,
}: {
  readonly wallet: SparkPaymentWallet
  readonly onchainAddress: BitcoinAddress
  readonly amountSats: number | undefined
}): Promise<QuoteResult> => {
  if (amountSats !== undefined && amountSats < ONCHAIN_WITHDRAWAL_MIN_SATS) {
    return err(
      createWithdrawalBelowMinimumError({
        minSats: ONCHAIN_WITHDRAWAL_MIN_SATS,
      })
    )
  }
  const { availableSats } = await wallet.getBalance()
  const withdrawAll = amountSats === undefined
  const quoteAmountSats = withdrawAll ? availableSats : amountSats

  if (quoteAmountSats <= 0 || quoteAmountSats > availableSats) {
    return err(
      createInsufficientWithdrawalBalanceError({
        availableSats,
        requestedSats: quoteAmountSats,
      })
    )
  }

  const feeQuote = await wallet.getWithdrawalFeeQuote({
    amountSats: quoteAmountSats,
    withdrawalAddress: onchainAddress,
  })
  if (!feeQuote) {
    return err(
      createWithdrawalQuoteFailedError({
        message: "No fee quote returned for this withdrawal",
      })
    )
  }
  // "Withdraw all" pays the fee out of the balance; even the cheapest speed
  // must leave the recipient something.
  const withdrawAllSats = onchainWithdrawAllAmountSats({
    availableSats,
    feeSats: feeQuote.slow.totalFeeSats,
  })
  if (withdrawAll && withdrawAllSats <= 0) {
    return err(
      createInsufficientWithdrawalBalanceError({
        availableSats,
        requestedSats: availableSats + feeQuote.slow.totalFeeSats,
      })
    )
  }
  if (withdrawAll && withdrawAllSats < ONCHAIN_WITHDRAWAL_MIN_SATS) {
    return err(
      createWithdrawalBelowMinimumError({
        minSats: ONCHAIN_WITHDRAWAL_MIN_SATS,
      })
    )
  }

  return ok({
    kind: "onchain",
    onchainAddress,
    availableSats,
    amountSats: quoteAmountSats,
    withdrawAll,
    feeQuote,
  })
}

/**
 * Prices a Lightning payment. The fee and the balance check use the LN
 * estimate even when the invoice has a Spark fallback: the SDK may fall back
 * to Lightning silently (withdraw/0004).
 */
const quoteLightningInvoice = async ({
  wallet,
  invoice,
  amountSats,
  lightningAddress,
  recipientText,
}: {
  readonly wallet: SparkPaymentWallet
  readonly invoice: LightningInvoice
  /** For an amountless invoice; `undefined` there means "withdraw all". */
  readonly amountSats: number | undefined
  readonly lightningAddress: string | null
  readonly recipientText: string | null
}): Promise<QuoteResult> => {
  const { availableSats } = await wallet.getBalance()
  const transferId = crypto.randomUUID()

  if (invoice.amountSats === null && amountSats === undefined) {
    const estimate = await wallet.getLightningSendFeeEstimate({
      invoice: invoice.invoice,
      amountSats: availableSats,
    })
    const maxFeeSats = lightningMaxFeeSats(estimate)
    const sendSats = availableSats - maxFeeSats
    if (sendSats <= 0) {
      return err(
        createInsufficientWithdrawalBalanceError({
          availableSats,
          requestedSats: availableSats + maxFeeSats,
        })
      )
    }
    return ok({
      kind: "lightning",
      availableSats,
      invoice,
      lightningAddress,
      recipientText,
      amountSats: sendSats,
      amountSatsToSend: sendSats,
      withdrawAll: true,
      maxFeeSats,
      transferId,
    })
  }

  const sendSats = invoice.amountSats ?? amountSats ?? 0
  const amountSatsToSend = invoice.amountSats === null ? sendSats : undefined
  const estimate = await wallet.getLightningSendFeeEstimate({
    invoice: invoice.invoice,
    amountSats: amountSatsToSend,
  })
  const maxFeeSats = lightningMaxFeeSats(estimate)
  if (sendSats + maxFeeSats > availableSats) {
    return err(
      createInsufficientWithdrawalBalanceError({
        availableSats,
        requestedSats: sendSats + maxFeeSats,
        maxSendableSats: Math.max(availableSats - maxFeeSats, 0),
      })
    )
  }

  return ok({
    kind: "lightning",
    availableSats,
    invoice,
    lightningAddress,
    recipientText,
    amountSats: sendSats,
    amountSatsToSend,
    withdrawAll: false,
    maxFeeSats,
    transferId,
  })
}

/**
 * Prices a withdrawal. `amountSats` is required for a Lightning address,
 * ignored for an invoice that carries its own amount, and `undefined` means
 * "withdraw all" on-chain or to an amountless invoice.
 */
export const quoteWithdrawal =
  ({
    accountId,
    destination,
    amountSats,
  }: {
    readonly accountId: AccountId
    readonly destination: SupportedWithdrawDestination
    readonly amountSats?: PositiveInteger
  }): Task<
    WithdrawalQuote,
    QuoteWithdrawalError,
    EvoluDep & SparkWalletDep & FetchDep & DateDep
  > =>
  async (run) => {
    const sparkAccount = await loadSparkAccount(run.deps.evolu, accountId)
    if (!sparkAccount) {
      return err(createWithdrawalAccountNotFoundError({ accountId }))
    }

    const priceWith = async (
      price: (wallet: SparkPaymentWallet) => Promise<QuoteResult>
    ): Promise<QuoteResult> => {
      try {
        await using wallet = await run.deps.sparkWallet.create(
          sparkAccount.secret
        )
        return await price(wallet)
      } catch (error) {
        return err(
          createWithdrawalQuoteFailedError({
            message: errorMessage(error, "Failed to price the withdrawal"),
          })
        )
      }
    }

    if (destination.kind === "onchain") {
      return await priceWith((wallet) =>
        quoteOnchain({
          wallet,
          onchainAddress: destination.address,
          amountSats,
        })
      )
    }

    let invoice: LightningInvoice
    let recipientText: string | null
    let lightningAddress: string | null = null

    if (destination.kind === "lightning-invoice") {
      invoice = destination
      recipientText = destination.description
    } else {
      if (amountSats === undefined) {
        return err(createWithdrawalAmountRequiredError())
      }
      const metadata = await run(
        fetchLnurlPayMetadata({ address: destination.address })
      )
      if (!metadata.ok) return metadata
      const { minSendableSats, maxSendableSats } = metadata.value
      if (amountSats < minSendableSats || amountSats > maxSendableSats) {
        return err(
          createWithdrawalAmountOutOfRangeError({
            minSats: minSendableSats,
            maxSats: maxSendableSats,
          })
        )
      }
      const fetched = await run(
        fetchLnurlPayInvoice({ amountSats, metadata: metadata.value })
      )
      if (!fetched.ok) return fetched
      invoice = fetched.value.invoice
      recipientText = metadata.value.text ?? null
      lightningAddress = destination.address
    }

    if (isExpired(invoice.expiresAt, run.deps.date.now())) {
      return err(createLightningInvoiceExpiredError())
    }

    return await priceWith(async (wallet) => {
      if (await isSelfWithdrawal(run.deps.evolu, wallet, invoice)) {
        return err(createSelfWithdrawalError())
      }
      return await quoteLightningInvoice({
        wallet,
        invoice,
        amountSats,
        lightningAddress,
        recipientText,
      })
    })
  }

/**
 * Writes an on-chain withdrawal's movement: what the recipient gets plus the
 * fee leaves the wallet. Shared by the withdrawal itself and the operator's
 * "the money left", which knows neither `coopExitRequestId` nor `txid`.
 */
const recordOnchainMovement =
  ({
    id,
    accountId,
    amountSats,
    feeSats,
    onchainAddress,
    exitSpeed,
    coopExitRequestId,
    txid,
    deviceId,
  }: {
    readonly id: AccountTransactionId
    readonly accountId: AccountId
    readonly amountSats: number
    readonly feeSats: number
    readonly onchainAddress: BitcoinAddress
    readonly exitSpeed: SparkExitSpeed
    readonly coopExitRequestId: NonEmptyString | null
    readonly txid: NonEmptyString | null
    readonly deviceId: DeviceId | null
  }): Task<void, never, EvoluDep & EvoluOwnerIdDep & DateDep> =>
  async (run) => {
    const now = run.deps.date.now()
    const rows = computeAccountTransactionRows(
      {
        id,
        accountId,
        amount: Integer(-(amountSats + feeSats)),
        currency: "BTC",
        occurredAt: TimestampMsSchema.decode(now.getTime()),
        note: null,
        internalTransferGroupId: null,
        onchain: {
          onchainAddress,
          coopExitRequestId,
          exitSpeed,
          feeSats: Integer(feeSats),
          txid,
        },
        source: { deviceId, source: "manual" },
      },
      now
    )
    await runMutationWithCompletion((options) =>
      upsertAccountTransactionRows(run.deps.evolu, rows, {
        ...options,
        ownerId: run.deps.evoluOwnerId,
      })
    )
    return ok()
  }

type ExecuteDeps = EvoluDep &
  EvoluOwnerIdDep &
  DateDep &
  SparkWalletDep &
  LockManagerDep &
  ConsoleDep

/**
 * Records a withdrawal, sends it, and records what is certain afterwards
 * (withdraw/0001–0003). Two mutation batches on purpose: the first, written
 * before any money moves, is what survives the app dying mid-send.
 *
 * Every error carrying a `withdrawalId` means the withdrawal exists and its
 * detail is the place to follow it; the others come back before anything was
 * written.
 */
export const executeWithdrawal =
  ({
    accountId,
    quote,
    exitSpeed,
    deviceId,
  }: {
    readonly accountId: AccountId
    readonly quote: WithdrawalQuote
    /** On-chain only. */
    readonly exitSpeed: SparkExitSpeed
    readonly deviceId: DeviceId | null
  }): Task<
    { readonly withdrawalId: WithdrawalId },
    ExecuteWithdrawalError,
    ExecuteDeps
  > =>
  async (run) => {
    const sparkAccount = await loadSparkAccount(run.deps.evolu, accountId)
    if (!sparkAccount) {
      return err(createWithdrawalAccountNotFoundError({ accountId }))
    }

    const now = run.deps.date.now()
    if (quote.kind === "lightning") {
      if (isExpired(quote.invoice.expiresAt, now)) {
        return err(createLightningInvoiceExpiredError())
      }
    } else if (isExpired(Date.parse(quote.feeQuote.expiresAt), now)) {
      return err(createWithdrawalQuoteExpiredError())
    }

    const onchainFeeSats =
      quote.kind === "onchain" ? quote.feeQuote[exitSpeed].totalFeeSats : 0
    const amountSats = withdrawalRecipientSats(quote, exitSpeed)
    if (amountSats <= 0) {
      return err(
        createInsufficientWithdrawalBalanceError({
          availableSats: quote.availableSats,
          requestedSats: quote.availableSats + onchainFeeSats,
        })
      )
    }
    // The quote checked "withdraw all" against the slow fee only; a faster
    // speed's fee can push it under what the SSP accepts.
    if (quote.kind === "onchain" && amountSats < ONCHAIN_WITHDRAWAL_MIN_SATS) {
      return err(
        createWithdrawalBelowMinimumError({
          minSats: ONCHAIN_WITHDRAWAL_MIN_SATS,
        })
      )
    }

    const withdrawalId = createRowId<"Withdrawal">()
    // Lightning: the id the sync job will record the transfer under.
    const accountTransactionId: AccountTransactionId =
      quote.kind === "lightning"
        ? deriveSparkAccountTransactionId(
            NonEmptyStringSchema.decode(quote.transferId)
          )
        : createRowId<"AccountTransaction">()

    await using wallet = await run.deps.sparkWallet.create(sparkAccount.secret)

    // Held through recording, sending and the follow-up write, so this
    // device's sync job never calls a withdrawal it is still sending
    // "not created" (withdraw/0007).
    return await run.deps.lockManager.request(
      `withdrawal-${withdrawalId}`,
      async () => {
        await runMutationWithCompletion((options) => {
          const mutationOptions = { ...options, ownerId: run.deps.evoluOwnerId }
          run.deps.evolu.upsert(
            "withdrawal",
            {
              id: withdrawalId,
              accountId,
              deviceId,
              amountSats: PositiveInteger(amountSats),
              accountTransactionId,
              failedAt: null,
              failureReason: null,
            },
            mutationOptions
          )
          if (quote.kind === "lightning") {
            run.deps.evolu.upsert(
              "withdrawalLightning",
              {
                id: withdrawalId,
                lightningAddress:
                  quote.lightningAddress === null
                    ? null
                    : NonEmptyStringSchema.decode(quote.lightningAddress),
                lnInvoice: NonEmptyStringSchema.decode(quote.invoice.invoice),
                sparkTransferId: NonEmptyStringSchema.decode(quote.transferId),
                maxFeeSats: NonNegativeInteger(quote.maxFeeSats),
              },
              mutationOptions
            )
          } else {
            run.deps.evolu.upsert(
              "withdrawalOnchain",
              {
                id: withdrawalId,
                onchainAddress: quote.onchainAddress,
                exitSpeed,
                feeSats: NonNegativeInteger(onchainFeeSats),
              },
              mutationOptions
            )
          }
        })

        const outcomeUnknown = (error: unknown) => {
          run.deps.console.warn("Withdrawal outcome unknown.", {
            withdrawalId,
            message: errorMessage(error, String(error)),
          })
          return err(createWithdrawalOutcomeUnknownError({ withdrawalId }))
        }

        if (quote.kind === "lightning") {
          let sent: Awaited<
            ReturnType<SparkPaymentWallet["payLightningInvoice"]>
          >
          try {
            sent = await wallet.payLightningInvoice({
              invoice: quote.invoice.invoice,
              maxFeeSats: quote.maxFeeSats,
              amountSatsToSend: quote.amountSatsToSend,
              transferId: quote.transferId,
            })
          } catch (error) {
            return outcomeUnknown(error)
          }
          // The sync job records the movement, for both routes (withdraw/0002).
          if (sent.kind === "sent") return ok({ withdrawalId })

          // `SparkValidationError` does not promise nothing left; only a
          // missing transfer does.
          let transferExists: boolean
          try {
            transferExists = await wallet.getTransfer(quote.transferId)
          } catch (error) {
            return outcomeUnknown(error)
          }
          if (transferExists) return outcomeUnknown(sent.message)

          run.deps.console.info("Lightning withdrawal rejected.", {
            withdrawalId,
            message: sent.message,
          })
          await run.ok(
            markWithdrawalFailed({ withdrawalId, reason: "rejected" })
          )
          return err(createWithdrawalRejectedError({ withdrawalId }))
        }

        try {
          const sent = await wallet.withdraw({
            onchainAddress: quote.onchainAddress,
            exitSpeed,
            feeQuoteId: quote.feeQuote.id,
            feeAmountSats: onchainFeeSats,
            // "Withdraw all" names the quoted balance: left out, the SDK would
            // send whatever the balance is by now, which is not what gets
            // recorded below.
            amountSats: quote.withdrawAll ? quote.availableSats : amountSats,
            deductFeeFromWithdrawalAmount: quote.withdrawAll,
          })
          // On-chain there is no transfer id to check a rejection against, so
          // it stays uncertain for the operator to settle (withdraw/0003).
          if (sent.kind === "rejected") return outcomeUnknown(sent.message)

          await run.ok(
            recordOnchainMovement({
              id: accountTransactionId,
              accountId,
              amountSats,
              feeSats: onchainFeeSats,
              onchainAddress: quote.onchainAddress,
              exitSpeed,
              coopExitRequestId: NonEmptyStringSchema.decode(sent.id),
              txid:
                sent.txid === null
                  ? null
                  : NonEmptyStringSchema.decode(sent.txid),
              deviceId,
            })
          )
          return ok({ withdrawalId })
        } catch (error) {
          return outcomeUnknown(error)
        }
      }
    )
  }

/**
 * Sets `failedAt` and why (withdraw/0003). Written by the withdrawal action,
 * the sync job's check, and the operator's "the money did not leave".
 */
export const markWithdrawalFailed =
  ({
    withdrawalId,
    reason,
  }: {
    readonly withdrawalId: WithdrawalId
    readonly reason: WithdrawalFailureReason
  }): Task<void, never, EvoluDep & EvoluOwnerIdDep & DateDep> =>
  async (run) => {
    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "withdrawal",
        {
          id: withdrawalId,
          failedAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
          failureReason: reason,
        },
        { ...options, ownerId: run.deps.evoluOwnerId }
      )
    )
    return ok()
  }

/**
 * The operator's "the money left" for an on-chain withdrawal whose follow-up
 * write never happened (withdraw/0002): records the movement under the
 * withdrawal's own `accountTransactionId`, so pressing it twice, or on two
 * devices, writes one row. A movement already there is left as it is.
 */
export const confirmOnchainWithdrawalSent =
  ({
    withdrawalId,
    deviceId,
  }: {
    readonly withdrawalId: WithdrawalId
    readonly deviceId: DeviceId | null
  }): Task<
    void,
    WithdrawalNotFoundError,
    EvoluDep & EvoluOwnerIdDep & DateDep
  > =>
  async (run) => {
    const [withdrawal] = await run.deps.evolu.loadQuery(
      withdrawalForResolutionQuery(withdrawalId)
    )
    if (withdrawal === undefined) {
      return err(createWithdrawalNotFoundError({ id: withdrawalId }))
    }
    const existing = await run.deps.evolu.loadQuery(
      accountTransactionExistsQuery(withdrawal.accountTransactionId)
    )
    if (existing.length > 0) return ok()

    await run.ok(
      recordOnchainMovement({
        id: withdrawal.accountTransactionId,
        accountId: withdrawal.accountId,
        amountSats: withdrawal.amountSats,
        feeSats: withdrawal.feeSats,
        onchainAddress: withdrawal.onchainAddress,
        exitSpeed: withdrawal.exitSpeed,
        coopExitRequestId: null,
        txid: null,
        deviceId,
      })
    )
    return ok()
  }
