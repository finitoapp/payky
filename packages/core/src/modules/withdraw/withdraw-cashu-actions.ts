import { err, ok, type Task } from "@evolu/common"

import type { CashuDeps } from "../../cashu/cashu-wallet.ts"
import type { DateDep, EvoluOwnerDep, FetchDep } from "../../deps.ts"
import { defineError } from "../../error.ts"
import type { LnurlError } from "../../integrations/lnurl/lnurl-client.ts"
import {
  fetchLnurlPayInvoice,
  fetchLnurlPayMetadata,
  type LightningAddressInvoiceMismatchError,
  type LnurlPayMetadata,
  lnurlPayComment,
} from "../../integrations/lnurl/lnurl-pay-client.ts"
import type { AccountId } from "../account/account-types.ts"
import {
  computeAccountTransactionRows,
  upsertAccountTransactionRows,
} from "../account-transaction/account-transaction-actions.ts"
import type { AccountTransactionId } from "../account-transaction/account-transaction-types.ts"
import { deriveCashuAccountTransactionId } from "../account-transaction/account-transaction-utils.ts"
import type { CashuMeltError, MintFailure } from "../cashu/cashu-errors.ts"
import { loadCashuMelt, loadCashuOperation } from "../cashu/cashu-guards.ts"
import {
  type CashuMeltCost,
  type CashuMeltSettlement,
  meltCashu,
  quoteCashuMelt,
} from "../cashu/cashu-melt-actions.ts"
import { cashuBalancesQuery } from "../cashu/cashu-queries.ts"
import {
  type CashuOperationId,
  type CashuQuoteId,
  CashuQuoteIdSchema,
  type MintUrl,
} from "../cashu/cashu-types.ts"
import { cashuMeltOperationIdFor } from "../cashu/cashu-utils.ts"
import type { DeviceId } from "../device/device-types.ts"
import { paymentIdsByLnInvoiceQuery } from "../payment/payment-queries.ts"
import type { EvoluDep } from "../shared/evolu-deps.ts"
import {
  createRowId,
  runMutationWithCompletion,
} from "../shared/evolu-utils.ts"
import type { LightningInvoice } from "../shared/lightning-invoice-utils.ts"
import {
  Integer,
  type NonEmptyString255,
  NonEmptyStringSchema,
  PositiveInteger,
  TimestampMsSchema,
} from "../shared/schema.ts"
import {
  createInsufficientWithdrawalBalanceError,
  createWithdrawalAmountOutOfRangeError,
  createWithdrawalOutcomeUnknownError,
  createWithdrawalRejectedError,
  type InsufficientWithdrawalBalanceError,
  type WithdrawalAmountOutOfRangeError,
  type WithdrawalOutcomeUnknownError,
  type WithdrawalRejectedError,
} from "./withdraw-actions.ts"
import type { WithdrawDestination } from "./withdraw-destination-utils.ts"
import { withdrawalByCashuMeltQuery } from "./withdraw-queries.ts"
import type { WithdrawalId } from "./withdraw-types.ts"
import { WITHDRAWAL_QUOTE_EXPIRY_MARGIN_MS } from "./withdraw-utils.ts"

/**
 * Withdrawing from Payky's own Cashu wallet (withdraw/0011, withdraw/0015):
 * one mint at a time, to a Lightning invoice or address, paid by a melt. The
 * fee reserve is the mint's own. A melt whose response was lost is settled by
 * its resume, which never sends again (withdraw/0013).
 */

const createCashuWithdrawalAmountNeededError = defineError(
  "CashuWithdrawalAmountNeeded"
)()
export type CashuWithdrawalAmountNeededError = ReturnType<
  typeof createCashuWithdrawalAmountNeededError
>

const createCashuWithdrawalToSelfError = defineError("CashuWithdrawalToSelf")()
export type CashuWithdrawalToSelfError = ReturnType<
  typeof createCashuWithdrawalToSelfError
>

const createCashuWithdrawalInvoiceExpiredError = defineError(
  "CashuWithdrawalInvoiceExpired"
)()
export type CashuWithdrawalInvoiceExpiredError = ReturnType<
  typeof createCashuWithdrawalInvoiceExpiredError
>

const createCashuWithdrawalDestinationError = defineError(
  "CashuWithdrawalDestinationUnsupported"
)()
export type CashuWithdrawalDestinationError = ReturnType<
  typeof createCashuWithdrawalDestinationError
>

export interface CashuWithdrawalQuote {
  readonly mint: MintUrl
  readonly invoice: string
  readonly lightningAddress: string | null
  /** The Lightning address's own text (LUD-06), shown before confirming. */
  readonly recipientText: string | null
  /** The LUD-12 comment the invoice was requested with, as sent. */
  readonly recipientComment: string | null
  /** What the recipient gets. */
  readonly amountSats: number
  /** The mint's balance the quote was sized against. */
  readonly availableSats: number
  /** Sized to the mint's balance (withdraw/0014). */
  readonly withdrawAll: boolean
  readonly cost: CashuMeltCost
  /** When confirming is refused: the invoice's or the melt quote's expiry, less the margin. */
  readonly expiresAt: number
}

export type QuoteCashuWithdrawalError =
  | MintFailure
  | LnurlError
  | LightningAddressInvoiceMismatchError
  | CashuWithdrawalAmountNeededError
  | CashuWithdrawalToSelfError
  | CashuWithdrawalInvoiceExpiredError
  | CashuWithdrawalDestinationError
  | InsufficientWithdrawalBalanceError
  | WithdrawalAmountOutOfRangeError

const isExpired = (invoice: LightningInvoice, now: Date): boolean =>
  invoice.expiresAt - WITHDRAWAL_QUOTE_EXPIRY_MARGIN_MS <= now.getTime()

/** The mint's available balance, as `costOfMelt` counts it. */
const loadMintBalance = async (
  deps: CashuDeps,
  mint: MintUrl
): Promise<number> =>
  (await deps.evolu.loadQuery(cashuBalancesQuery)).find(
    (row) => row.mintUrl === mint
  )?.balance ?? 0

/**
 * What "withdraw all" sends to a Lightning address (withdraw/0014): a probe
 * invoice for the whole balance, at most `maxSendable`, prices the mint's fee
 * reserve and input fee; the fees for the smaller final amount are no
 * higher, and the caller prices that invoice again anyway.
 */
const cashuLightningAddressWithdrawAllSats =
  ({
    mint,
    metadata,
  }: {
    readonly mint: MintUrl
    readonly metadata: LnurlPayMetadata
  }): Task<
    PositiveInteger,
    | MintFailure
    | InsufficientWithdrawalBalanceError
    | LightningAddressInvoiceMismatchError
    | LnurlError,
    CashuDeps & FetchDep & DateDep
  > =>
  async (run) => {
    const { minSendableSats, maxSendableSats } = metadata
    const availableSats = await loadMintBalance(run.deps, mint)
    const probeSats = Math.min(availableSats, maxSendableSats)
    if (probeSats < minSendableSats || probeSats <= 0) {
      return err(
        createInsufficientWithdrawalBalanceError({
          availableSats,
          requestedSats: minSendableSats,
        })
      )
    }
    const probe = await run(
      fetchLnurlPayInvoice({ amountSats: probeSats, metadata })
    )
    if (!probe.ok) return probe
    const cost = await run(
      quoteCashuMelt({ mint, invoice: probe.value.invoice.invoice })
    )
    if (!cost.ok) return cost
    const fees = cost.value.feeReserve + cost.value.inputFee
    const sendSats = Math.min(availableSats - fees, maxSendableSats)
    if (sendSats < minSendableSats || sendSats <= 0) {
      return err(
        createInsufficientWithdrawalBalanceError({
          availableSats,
          requestedSats: minSendableSats + fees,
        })
      )
    }
    return ok(PositiveInteger(sendSats))
  }

/**
 * Prices a withdrawal from `mint`. An invoice carries its amount; a
 * Lightning address takes one, or `undefined` for "withdraw all"
 * (withdraw/0014). Refused here, as Spark's is, when the mint's balance
 * cannot cover the amount and the mint's fees.
 */
export const quoteCashuWithdrawal =
  ({
    mint,
    destination,
    amountSats,
    recipientComment,
  }: {
    readonly mint: MintUrl
    readonly destination: WithdrawDestination
    /** `undefined` to a Lightning address means "withdraw all". */
    readonly amountSats?: PositiveInteger
    /** LUD-12, for a Lightning address that accepts it; ignored elsewhere. */
    readonly recipientComment?: string
  }): Task<
    CashuWithdrawalQuote,
    QuoteCashuWithdrawalError,
    CashuDeps & EvoluDep & FetchDep & DateDep
  > =>
  async (run) => {
    let invoice: LightningInvoice
    let lightningAddress: string | null = null
    let recipientText: string | null = null
    let sentComment: string | null = null
    const withdrawAll =
      destination.kind === "lightning-address" && amountSats === undefined
    if (destination.kind === "lightning-invoice") {
      if (destination.amountSats === null)
        return err(createCashuWithdrawalAmountNeededError())
      invoice = destination
    } else if (destination.kind === "lightning-address") {
      const metadata = await run(
        fetchLnurlPayMetadata({ address: destination.address })
      )
      if (!metadata.ok) return metadata
      const { minSendableSats, maxSendableSats } = metadata.value
      if (
        amountSats !== undefined &&
        (amountSats < minSendableSats || amountSats > maxSendableSats)
      ) {
        return err(
          createWithdrawalAmountOutOfRangeError({
            minSats: minSendableSats,
            maxSats: maxSendableSats,
          })
        )
      }
      let sendSats = amountSats
      if (sendSats === undefined) {
        const sized = await run(
          cashuLightningAddressWithdrawAllSats({
            mint,
            metadata: metadata.value,
          })
        )
        if (!sized.ok) return sized
        sendSats = sized.value
      }
      // Only the invoice paid carries the comment, not the probe above.
      const fetched = await run(
        fetchLnurlPayInvoice({
          amountSats: sendSats,
          metadata: metadata.value,
          comment: recipientComment,
        })
      )
      if (!fetched.ok) return fetched
      invoice = fetched.value.invoice
      lightningAddress = destination.address
      recipientText = metadata.value.text ?? null
      sentComment = lnurlPayComment(metadata.value, recipientComment)
    } else {
      return err(createCashuWithdrawalDestinationError())
    }
    if (isExpired(invoice, run.deps.date.now()))
      return err(createCashuWithdrawalInvoiceExpiredError())
    // withdraw/0006: never one of our own payment invoices.
    const own = await run.deps.evolu.loadQuery(
      paymentIdsByLnInvoiceQuery(NonEmptyStringSchema.decode(invoice.invoice))
    )
    if (own.length > 0) return err(createCashuWithdrawalToSelfError())

    const cost = await run(quoteCashuMelt({ mint, invoice: invoice.invoice }))
    if (!cost.ok) return cost
    const availableSats = await loadMintBalance(run.deps, mint)
    if (cost.value.maxTotal > availableSats) {
      return err(
        createInsufficientWithdrawalBalanceError({
          availableSats,
          requestedSats: cost.value.maxTotal,
          maxSendableSats: Math.max(
            availableSats - cost.value.feeReserve - cost.value.inputFee,
            0
          ),
        })
      )
    }
    const meltExpiresAt =
      cost.value.expiresAtSec === null
        ? Number.POSITIVE_INFINITY
        : cost.value.expiresAtSec * 1000
    return ok({
      mint,
      invoice: invoice.invoice,
      lightningAddress,
      recipientText,
      recipientComment: sentComment,
      amountSats: cost.value.amount,
      availableSats,
      withdrawAll,
      cost: cost.value,
      expiresAt:
        Math.min(invoice.expiresAt, meltExpiresAt) -
        WITHDRAWAL_QUOTE_EXPIRY_MARGIN_MS,
    })
  }

/**
 * What a Cashu withdrawal writes in the batch that settles its melt
 * (cashu/0014): its movement once the melt is `paid`, from the receipt, or
 * its failure once the mint refused it.
 */
const cashuWithdrawalSettlement = (
  { evolu, date }: EvoluDep & DateDep,
  withdrawal: {
    readonly id: WithdrawalId
    readonly accountId: AccountId
    readonly deviceId: DeviceId | null
    readonly accountTransactionId: AccountTransactionId
  },
  melt: {
    readonly operationId: CashuOperationId
    readonly quoteId: CashuQuoteId
    readonly mintUrl: MintUrl
  }
): CashuMeltSettlement => ({
  paid: (receipt, options) =>
    upsertAccountTransactionRows(
      evolu,
      computeAccountTransactionRows(
        {
          id: withdrawal.accountTransactionId,
          accountId: withdrawal.accountId,
          amount: Integer(-receipt.totalSpent),
          currency: "BTC",
          occurredAt: TimestampMsSchema.decode(date.now().getTime()),
          note: null,
          internalTransferGroupId: null,
          source: { deviceId: withdrawal.deviceId, source: "auto" },
          cashu: {
            cashuOperationId: melt.operationId,
            quoteId: melt.quoteId,
            mintUrl: melt.mintUrl,
          },
        },
        date.now()
      ),
      options
    ),
  closed: (_status, options) =>
    evolu.update(
      "withdrawal",
      {
        id: withdrawal.id,
        failedAt: TimestampMsSchema.decode(date.now().getTime()),
        failureReason: "rejected",
      },
      options
    ),
})

/**
 * The settlement of the withdrawal a melt pays, for the Cashu job that
 * resumes the melt; null when no withdrawal holds it.
 */
export const loadCashuWithdrawalSettlement =
  (
    meltOperationId: CashuOperationId
  ): Task<CashuMeltSettlement | null, never, EvoluDep & DateDep> =>
  async (run) => {
    const [withdrawal] = await run.deps.evolu.loadQuery(
      withdrawalByCashuMeltQuery(meltOperationId)
    )
    const melt = await run.ok(loadCashuMelt(meltOperationId))
    if (withdrawal === undefined || melt === null) return ok(null)
    return ok(
      cashuWithdrawalSettlement(run.deps, withdrawal, {
        operationId: meltOperationId,
        quoteId: melt.quoteId,
        mintUrl: melt.mintUrl,
      })
    )
  }

export type ExecuteCashuWithdrawalError =
  | CashuMeltError
  | CashuWithdrawalDestinationError
  | WithdrawalRejectedError
  | WithdrawalOutcomeUnknownError

/**
 * Records the withdrawal before any money leaves (withdraw/0001), melts, and
 * writes its movement or its failure in the batch that settles the melt
 * (cashu/0014). A melt still pending is left to the Cashu job.
 */
export const executeCashuWithdrawal =
  ({
    accountId,
    deviceId,
    quote,
    comment,
  }: {
    readonly accountId: AccountId
    readonly deviceId: DeviceId | null
    readonly quote: CashuWithdrawalQuote
    readonly comment?: NonEmptyString255
  }): Task<
    { readonly withdrawalId: WithdrawalId; readonly totalSpent: number },
    ExecuteCashuWithdrawalError,
    CashuDeps & EvoluDep & EvoluOwnerDep & DateDep
  > =>
  async (run) => {
    const quoteId = CashuQuoteIdSchema.safeParse(quote.cost.quoteId)
    if (!quoteId.success) return err(createCashuWithdrawalDestinationError())
    const meltOperationId = cashuMeltOperationIdFor(quote.mint, quoteId.data)
    const withdrawalId = createRowId<"Withdrawal">()

    await runMutationWithCompletion((options) => {
      const mutationOptions = { ...options, owner: run.deps.evoluOwner }
      run.deps.evolu.upsert(
        "withdrawal",
        {
          id: withdrawalId,
          accountId,
          deviceId,
          amountSats: PositiveInteger(quote.amountSats),
          accountTransactionId:
            deriveCashuAccountTransactionId(meltOperationId),
          failedAt: null,
          failureReason: null,
          comment: comment ?? null,
        },
        mutationOptions
      )
      run.deps.evolu.upsert(
        "withdrawalLightningCashu",
        {
          id: withdrawalId,
          mintUrl: quote.mint,
          quoteId: quoteId.data,
          meltOperationId,
          lnInvoice: NonEmptyStringSchema.decode(quote.invoice),
          lightningAddress:
            quote.lightningAddress === null
              ? null
              : NonEmptyStringSchema.decode(quote.lightningAddress),
        },
        mutationOptions
      )
    })

    const melted = await run(
      meltCashu({
        mint: quote.mint,
        invoice: quote.invoice,
        quoteId: quoteId.data,
        maxTotal: quote.cost.maxTotal,
        purpose: "withdrawal",
        settlement: cashuWithdrawalSettlement(
          run.deps,
          {
            id: withdrawalId,
            accountId,
            deviceId,
            accountTransactionId:
              deriveCashuAccountTransactionId(meltOperationId),
          },
          {
            operationId: meltOperationId,
            quoteId: quoteId.data,
            mintUrl: quote.mint,
          }
        ),
      })
    )
    if (!melted.ok) {
      // Refused before the melt existed: nothing moved and nothing is left
      // for the job to settle, so the withdrawal fails here and the review
      // shows why.
      const melt = await run.ok(loadCashuOperation(meltOperationId))
      if (melt === null) {
        await runMutationWithCompletion((options) =>
          run.deps.evolu.update(
            "withdrawal",
            {
              id: withdrawalId,
              failedAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
              failureReason: "rejected",
            },
            { ...options, owner: run.deps.evoluOwner }
          )
        )
        return melted
      }
      // The melt was sent: its withdrawal's detail follows what happens next.
      return err(
        melt.status === "unpaid" || melt.status === "failed"
          ? createWithdrawalRejectedError({ withdrawalId })
          : createWithdrawalOutcomeUnknownError({ withdrawalId })
      )
    }
    return ok({ withdrawalId, totalSpent: melted.value.totalSpent })
  }
