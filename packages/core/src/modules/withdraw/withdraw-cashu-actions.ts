import { err, ok, type Task } from "@evolu/common"

import {
  type CashuMeltCost,
  type CashuMeltError,
  meltCashu,
  quoteCashuMelt,
} from "../../cashu/cashu-melt.ts"
import type { CashuTopupDeps } from "../../cashu/cashu-topup.ts"
import type { MintFailure } from "../../cashu/cashu-wallet.ts"
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
import { accountTransactionExistsQuery } from "../account-transaction/account-transaction-queries.ts"
import { deriveCashuAccountTransactionId } from "../account-transaction/account-transaction-utils.ts"
import { sumAvailableByMint } from "../cashu/cashu-queries.ts"
import {
  type CashuOperationId,
  CashuQuoteIdSchema,
  type MintUrl,
} from "../cashu/cashu-types.ts"
import { cashuOperationIdFor, operationKeyOf } from "../cashu/cashu-utils.ts"
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
 * Withdrawing from the wallet shared with Linky (cashu.md §6, withdraw/0011–
 * 0014): one mint at a time, to a Lightning invoice or address, paid by
 * Linky's melt. The fee reserve is the mint's own, and the balance is the
 * shared one, money received in Linky included. A melt whose response was
 * lost is settled by its resume, which never sends again (withdraw/0007).
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
  deps: CashuTopupDeps,
  mint: MintUrl
): Promise<number> =>
  sumAvailableByMint(await deps.cashuShardStore.loadProofs()).get(mint) ?? 0

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
    CashuTopupDeps & FetchDep & DateDep
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
    CashuTopupDeps & EvoluDep & FetchDep & DateDep
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

/** The melt a quote's withdrawal pays with: its id derives from mint and quote. */
export const cashuMeltOperationIdFor = (
  mint: MintUrl,
  quoteId: string
): CashuOperationId =>
  cashuOperationIdFor(
    operationKeyOf({ kind: "melt", mint, quoteId, tokenText: null })
  )

/**
 * The withdrawal's movement once its melt is `paid`, or its failure once the
 * mint refused it; nothing while it is still pending. Shared by the
 * withdrawal and the Cashu job that resumes its melt. A movement already
 * written stays as it is.
 */
export const settleCashuWithdrawal =
  (
    meltOperationId: CashuOperationId,
    /** From the melt's receipt; another device's settle knows only the inputs. */
    totalSpent?: number
  ): Task<
    "done" | "failed" | "pending" | "none",
    never,
    CashuTopupDeps & EvoluDep & EvoluOwnerDep
  > =>
  async (run) => {
    const [withdrawal] = await run.deps.evolu.loadQuery(
      withdrawalByCashuMeltQuery(meltOperationId)
    )
    if (withdrawal === undefined) return ok("none")
    const operation =
      await run.deps.cashuShardStore.loadOperation(meltOperationId)
    if (operation === null || operation.status === "pending")
      return ok("pending")
    if (operation.status !== "paid") {
      if (withdrawal.failedAt === null)
        await runMutationWithCompletion((options) =>
          run.deps.evolu.update(
            "withdrawal",
            {
              id: withdrawal.id,
              failedAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
              failureReason: "rejected",
            },
            { ...options, owner: run.deps.evoluOwner }
          )
        )
      return ok("failed")
    }
    const [existing] = await run.deps.evolu.loadQuery(
      accountTransactionExistsQuery(withdrawal.accountTransactionId)
    )
    if (existing !== undefined) return ok("done")
    // What left the wallet: the inputs less the change, or the inputs when
    // the change is not known here (an upper bound).
    const spent = totalSpent ?? operation.inputsTotal ?? operation.amount
    const computed = computeAccountTransactionRows(
      {
        id: withdrawal.accountTransactionId,
        accountId: withdrawal.accountId,
        amount: Integer(-spent),
        currency: "BTC",
        occurredAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
        note: null,
        internalTransferGroupId: null,
        source: { deviceId: withdrawal.deviceId, source: "auto" },
        cashu: {
          cashuOperationId: meltOperationId,
          quoteId: operation.quoteId,
          mintUrl: operation.mint,
        },
      },
      run.deps.date.now()
    )
    await runMutationWithCompletion((options) =>
      upsertAccountTransactionRows(run.deps.evolu, computed, {
        ...options,
        owner: run.deps.evoluOwner,
      })
    )
    return ok("done")
  }

export type ExecuteCashuWithdrawalError =
  | CashuMeltError
  | CashuWithdrawalDestinationError
  | WithdrawalRejectedError
  | WithdrawalOutcomeUnknownError

/**
 * Records the withdrawal before any money leaves (withdraw/0001), melts, and
 * writes its movement or its failure. A melt still pending is left to the
 * Cashu job.
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
    CashuTopupDeps & EvoluDep & EvoluOwnerDep & DateDep
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
      })
    )
    const settled = await run(
      settleCashuWithdrawal(
        meltOperationId,
        melted.ok ? melted.value.totalSpent : undefined
      )
    )
    if (!melted.ok) {
      // Refused before the melt existed: nothing moved and nothing is left
      // for the job to settle, so the withdrawal fails here and the review
      // shows why.
      if (
        (await run.deps.cashuShardStore.loadOperation(meltOperationId)) === null
      ) {
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
        settled.ok && settled.value === "failed"
          ? createWithdrawalRejectedError({ withdrawalId })
          : createWithdrawalOutcomeUnknownError({ withdrawalId })
      )
    }
    return ok({ withdrawalId, totalSpent: melted.value.totalSpent })
  }
