import {
  createIdFromString,
  type InsertValues,
  type MutationOptions,
  ok,
  sqliteTrue,
  type Task,
  type UpdateValues,
} from "@evolu/common"
import type { RequireOneOrNone, Simplify } from "type-fest"
import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  createRowId,
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/evolu-utils.ts"
import {
  type NonEmptyString,
  type NonEmptyString255,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import {
  assertHasSparkIdentifier,
  type WithSparkDetails,
} from "@/core/spark/spark-details.ts"
import type {
  AccountTransactionRow,
  accountTransaction,
  accountTransactionIban,
  accountTransactionLightning,
  accountTransactionOnchain,
  accountTransactionSource,
  accountTransactionSpark,
  accountTransactionSparkInvoice,
} from "./account-transaction.ts"
import type { AccountTransactionId } from "./account-transaction-types.ts"

type AccountTransactionSparkInput = WithSparkDetails<
  InsertValues<typeof accountTransactionSpark>,
  Omit<InsertValues<typeof accountTransactionLightning>, "id">,
  Omit<InsertValues<typeof accountTransactionSparkInvoice>, "id">
>

type AccountTransactionOnchainInput = Omit<
  InsertValues<typeof accountTransactionOnchain>,
  "id"
>

/**
 * Deliberately separate from `AccountTransactionSparkInput`, which is why
 * `createAccountTransaction` and `updateAccountTransaction` write these three
 * tables in two near-identical blocks instead of sharing a helper.
 * `UpsertValues` requires every non-nullable column where `UpdateValues` is
 * all-optional, and a helper taking the mode resolves `evolu[mode]` to the
 * *intersection* of the two signatures — so it would only compile against
 * upsert-strength values, dropping the guarantee that a created transaction
 * has a complete Spark row. Same reason `upsertPaymentSparkDetails` covers
 * only the upsert side; see its comment.
 */
type AccountTransactionSparkUpdateInput = WithSparkDetails<
  Omit<UpdateValues<typeof accountTransactionSpark>, "id">,
  Omit<UpdateValues<typeof accountTransactionLightning>, "id">,
  Omit<UpdateValues<typeof accountTransactionSparkInvoice>, "id">
>

/**
 * The id a money movement is recorded under — derived from whatever uniquely
 * identifies it at its source, so re-recording the same movement (a retried
 * write, a sync that replays a statement) lands on the row already there
 * instead of counting the money twice.
 *
 * `undefined` means there is nothing to derive one from, and the caller gets a
 * fresh random id: a cash-drawer movement has no detail row, so two identical
 * ones really are two movements. Callers that need idempotence there pass
 * their own id — `markPaymentPaidCash` derives one from the payment.
 *
 * An IBAN row without a `bankReference` is the same situation: only the bank's
 * own reference makes a transfer identifiable, and a manually entered one has
 * none.
 */
const deriveAccountTransactionId = (
  accountId: AccountTransactionRow["accountId"],
  detail: {
    readonly iban?: { readonly bankReference?: NonEmptyString255 | null }
    readonly spark?: { readonly sparkTransferId: NonEmptyString }
    readonly onchain?: { readonly coopExitRequestId: NonEmptyString }
  }
): AccountTransactionId | undefined => {
  const { iban, spark, onchain } = detail

  if (iban) {
    if (iban.bankReference === null || iban.bankReference === undefined) {
      return undefined
    }
    return createIdFromString<"AccountTransaction">(
      `accountTransaction:iban:${accountId}:${iban.bankReference}`
    )
  }
  if (spark) {
    return createIdFromString<"AccountTransaction">(
      `accountTransaction:spark:${spark.sparkTransferId}`
    )
  }
  if (onchain) {
    return createIdFromString<"AccountTransaction">(
      `accountTransaction:onchain:${onchain.coopExitRequestId}`
    )
  }

  return undefined
}

/**
 * Which kind of movement a write describes, from the one detail payload it
 * carries, or `undefined` when it carries none. Both callers take
 * `RequireOneOrNone`, so at most one key is present and the order matters no
 * more than it does for the id above.
 *
 * The `undefined` case is where the two callers part ways, which is why this
 * returns it rather than defaulting: a create with no detail row *is* a
 * cash-drawer movement, but an update with no detail payload must leave the
 * stored kind alone — reclassifying an existing IBAN or Spark transaction
 * because someone edited its note would be wrong.
 */
const deriveAccountTransactionKind = (detail: {
  readonly iban?: unknown
  readonly spark?: unknown
  readonly onchain?: unknown
}): AccountTransactionRow["kind"] | undefined => {
  if (detail.iban) return "iban"
  if (detail.spark) return "spark"
  if (detail.onchain) return "onchain"
  return undefined
}

export type CreateAccountTransactionInput = Simplify<
  Omit<InsertValues<typeof accountTransaction>, "kind"> & {
    readonly id?: AccountTransactionId
    readonly source: Omit<
      InsertValues<typeof accountTransactionSource>,
      "id" | "accountTransactionId" | "recordedAt"
    > & {
      readonly recordedAt?: InsertValues<
        typeof accountTransactionSource
      >["recordedAt"]
    }
  } & RequireOneOrNone<{
      iban: Omit<
        InsertValues<typeof accountTransactionIban>,
        "bankReference"
      > & {
        readonly bankReference?: NonEmptyString255 | null
      }
      spark: AccountTransactionSparkInput
      onchain: AccountTransactionOnchainInput
    }>
>

/**
 * Derives the account transaction's id/kind and resolves its source's
 * `recordedAt`, without writing anything. Exported so a caller that must
 * write the transaction and something depending on it (a reconciliation
 * claim, in `markPaymentPaid`) in one mutation batch can compute this first
 * and pass the result to {@link upsertAccountTransactionRows} directly,
 * instead of always opening a separate batch through
 * {@link createAccountTransaction}.
 */
export const computeAccountTransactionRows = (
  {
    id: providedId,
    iban,
    spark,
    onchain,
    source,
    ...input
  }: CreateAccountTransactionInput,
  now: Date
) => {
  assertHasSparkIdentifier(
    spark,
    "Spark account transaction requires lnInvoice or sparkInvoice."
  )

  const id =
    providedId ??
    deriveAccountTransactionId(input.accountId, { iban, spark, onchain }) ??
    createRowId<"AccountTransaction">()
  const sourceId = createIdFromString<"AccountTransactionSource">(
    `accountTransactionSource:${id}:${source.source}`
  )
  // No detail row means a cash-drawer movement.
  const kind =
    deriveAccountTransactionKind({ iban, spark, onchain }) ?? "cashRegister"

  return {
    id,
    kind,
    input,
    sourceId,
    source,
    recordedAt: source.recordedAt ?? TimestampMsSchema.decode(now.getTime()),
    iban,
    spark,
    onchain,
  }
}

/**
 * Upserts the rows {@link computeAccountTransactionRows} describes. Takes
 * the caller's own `MutationOptions` so the writes can join an existing
 * mutation batch instead of always opening a new one.
 */
export const upsertAccountTransactionRows = (
  evolu: EvoluDep["evolu"],
  computed: ReturnType<typeof computeAccountTransactionRows>,
  options: MutationOptions
): void => {
  const {
    id,
    kind,
    input,
    sourceId,
    source,
    recordedAt,
    iban,
    spark,
    onchain,
  } = computed

  if (iban) {
    evolu.upsert(
      "accountTransactionIban",
      removeUndefinedValues({
        ...iban,
        bankReference: iban.bankReference ?? null,
        id,
      }),
      options
    )
  }

  if (spark) {
    evolu.upsert(
      "accountTransactionSpark",
      removeUndefinedValues({
        sparkTransferId: spark.sparkTransferId,
        id,
      }),
      options
    )
    if (spark.lightning) {
      evolu.upsert(
        "accountTransactionLightning",
        removeUndefinedValues({
          ...spark.lightning,
          id,
        }),
        options
      )
    }
    if (spark.sparkInvoice) {
      evolu.upsert(
        "accountTransactionSparkInvoice",
        removeUndefinedValues({
          ...spark.sparkInvoice,
          id,
        }),
        options
      )
    }
  }

  if (onchain) {
    evolu.upsert(
      "accountTransactionOnchain",
      removeUndefinedValues({
        ...onchain,
        id,
      }),
      options
    )
  }

  evolu.upsert(
    "accountTransactionSource",
    removeUndefinedValues({
      ...source,
      id: sourceId,
      accountTransactionId: id,
      recordedAt,
    }),
    options
  )

  evolu.upsert(
    "accountTransaction",
    removeUndefinedValues({
      ...input,
      id,
      kind,
    }),
    options
  )
}

export const createAccountTransaction =
  (
    input: CreateAccountTransactionInput
  ): Task<AccountTransactionId, never, EvoluDep & EvoluOwnerIdDep & DateDep> =>
  async (run) => {
    const computed = computeAccountTransactionRows(input, run.deps.date.now())

    await runMutationWithCompletion((options) =>
      upsertAccountTransactionRows(run.deps.evolu, computed, {
        ...options,
        ownerId: run.deps.evoluOwnerId,
      })
    )

    return ok(computed.id)
  }

export const updateAccountTransaction =
  ({
    iban,
    spark,
    ...input
  }: Simplify<
    Pick<
      UpdateValues<typeof accountTransaction>,
      | "id"
      | "accountId"
      | "amount"
      | "currency"
      | "occurredAt"
      | "note"
      | "internalTransferGroupId"
    > &
      RequireOneOrNone<{
        iban: Omit<UpdateValues<typeof accountTransactionIban>, "id">
        spark: AccountTransactionSparkUpdateInput
      }>
  >): Task<AccountTransactionId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    // Left `undefined` without a detail payload, so a partial update does not
    // reclassify an existing iban/spark transaction — see the helper.
    const kind = deriveAccountTransactionKind({ iban, spark })

    await runMutationWithCompletion((options) => {
      if (iban) {
        run.deps.evolu.update(
          "accountTransactionIban",
          removeUndefinedValues({
            ...iban,
            id: input.id,
          }),
          { ...options, ownerId: evoluOwnerId }
        )
      }

      if (spark) {
        run.deps.evolu.update(
          "accountTransactionSpark",
          removeUndefinedValues({
            sparkTransferId: spark.sparkTransferId,
            id: input.id,
          }),
          { ...options, ownerId: evoluOwnerId }
        )
        if (spark.lightning) {
          run.deps.evolu.update(
            "accountTransactionLightning",
            removeUndefinedValues({
              ...spark.lightning,
              id: input.id,
            }),
            { ...options, ownerId: evoluOwnerId }
          )
        }
        if (spark.sparkInvoice) {
          run.deps.evolu.update(
            "accountTransactionSparkInvoice",
            removeUndefinedValues({
              ...spark.sparkInvoice,
              id: input.id,
            }),
            { ...options, ownerId: evoluOwnerId }
          )
        }
      }

      return run.deps.evolu.update(
        "accountTransaction",
        removeUndefinedValues({
          ...input,
          kind,
        }),
        { ...options, ownerId: evoluOwnerId }
      )
    })

    return ok(input.id)
  }

export const deleteAccountTransaction =
  (
    idValue: AccountTransactionId
  ): Task<AccountTransactionId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "accountTransaction",
        {
          id: idValue,
          isDeleted: sqliteTrue,
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(idValue)
  }
