import { err, ok, type Task } from "@evolu/common"

import {
  type CashuMeltCost,
  type CashuMeltError,
  meltCashu,
  quoteCashuMelt,
} from "@/core/cashu/cashu-melt.ts"
import type { CashuTopupDeps } from "@/core/cashu/cashu-topup.ts"
import type { MintFailure } from "@/core/cashu/cashu-wallet.ts"
import type { DateDep, EvoluOwnerDep, FetchDep } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import type { LnurlError } from "@/core/integrations/lnurl/lnurl-client.ts"
import {
  fetchLnurlPayInvoice,
  fetchLnurlPayMetadata,
  type LightningAddressInvoiceMismatchError,
} from "@/core/integrations/lnurl/lnurl-pay-client.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import {
  computeAccountTransactionRows,
  upsertAccountTransactionRows,
} from "@/core/modules/account-transaction/account-transaction-actions.ts"
import { accountTransactionExistsQuery } from "@/core/modules/account-transaction/account-transaction-queries.ts"
import { deriveCashuAccountTransactionId } from "@/core/modules/account-transaction/account-transaction-utils.ts"
import {
  type CashuOperationId,
  CashuQuoteIdSchema,
  type MintUrl,
} from "@/core/modules/cashu/cashu-types.ts"
import {
  cashuOperationIdFor,
  operationKeyOf,
} from "@/core/modules/cashu/cashu-utils.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import { paymentIdsByLnInvoiceQuery } from "@/core/modules/payment/payment-queries.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  createRowId,
  runMutationWithCompletion,
} from "@/core/modules/shared/evolu-utils.ts"
import type { LightningInvoice } from "@/core/modules/shared/lightning-invoice-utils.ts"
import {
  Integer,
  type NonEmptyString255,
  NonEmptyStringSchema,
  PositiveInteger,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import type { WithdrawDestination } from "./withdraw-destination-utils.ts"
import { withdrawalByCashuMeltQuery } from "./withdraw-queries.ts"
import type { WithdrawalId } from "./withdraw-types.ts"
import { WITHDRAWAL_QUOTE_EXPIRY_MARGIN_MS } from "./withdraw-utils.ts"

/**
 * Withdrawing from the wallet shared with Linky (cashu.md §6, withdraw/0011–
 * 0013): one mint at a time, to a Lightning invoice or address, paid by
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
  /** What the recipient gets. */
  readonly amountSats: number
  readonly cost: CashuMeltCost
}

export type QuoteCashuWithdrawalError =
  | MintFailure
  | LnurlError
  | LightningAddressInvoiceMismatchError
  | CashuWithdrawalAmountNeededError
  | CashuWithdrawalToSelfError
  | CashuWithdrawalInvoiceExpiredError
  | CashuWithdrawalDestinationError

const isExpired = (invoice: LightningInvoice, now: Date): boolean =>
  invoice.expiresAt - WITHDRAWAL_QUOTE_EXPIRY_MARGIN_MS <= now.getTime()

/**
 * Prices a withdrawal from `mint`. An invoice carries its amount; a
 * Lightning address needs one.
 * ponytail: no "withdraw all" from a mint yet; the mint's fee reserve makes
 * the most sendable amount a probe loop, add it when merchants ask.
 */
export const quoteCashuWithdrawal =
  ({
    mint,
    destination,
    amountSats,
  }: {
    readonly mint: MintUrl
    readonly destination: WithdrawDestination
    readonly amountSats?: PositiveInteger
  }): Task<
    CashuWithdrawalQuote,
    QuoteCashuWithdrawalError,
    CashuTopupDeps & EvoluDep & FetchDep
  > =>
  async (run) => {
    let invoice: LightningInvoice
    let lightningAddress: string | null = null
    if (destination.kind === "lightning-invoice") {
      if (destination.amountSats === null)
        return err(createCashuWithdrawalAmountNeededError())
      invoice = destination
    } else if (destination.kind === "lightning-address") {
      if (amountSats === undefined)
        return err(createCashuWithdrawalAmountNeededError())
      const metadata = await run(
        fetchLnurlPayMetadata({ address: destination.address })
      )
      if (!metadata.ok) return metadata
      const fetched = await run(
        fetchLnurlPayInvoice({ amountSats, metadata: metadata.value })
      )
      if (!fetched.ok) return fetched
      invoice = fetched.value.invoice
      lightningAddress = destination.address
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
    return ok({
      mint,
      invoice: invoice.invoice,
      lightningAddress,
      amountSats: cost.value.amount,
      cost: cost.value,
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
    await run(
      settleCashuWithdrawal(
        meltOperationId,
        melted.ok ? melted.value.totalSpent : undefined
      )
    )
    if (!melted.ok) {
      // Refused before the melt existed: nothing for the job to settle.
      if (
        melted.error.type === "CashuInsufficientFunds" ||
        melted.error.type === "CashuMeltQuoteNotPayable" ||
        melted.error.type === "QuoteExpired" ||
        melted.error.type === "MintUnreachable"
      )
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
    return ok({ withdrawalId, totalSpent: melted.value.totalSpent })
  }
