import {
  createIdFromString,
  type InsertValues,
  ok,
  sqliteTrue,
  type Task,
  type UpdateValues,
} from "@evolu/common"
import type { RequireOneOrNone, Simplify } from "type-fest"
import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  type NonEmptyString,
  type NonEmptyString255,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import {
  assertHasSparkIdentifier,
  createTableId,
  removeUndefinedValues,
  runMutationWithCompletion,
  type WithSparkDetails,
} from "@/core/modules/shared/utils.ts"
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

export const createAccountTransaction =
  ({
    id: providedId,
    iban,
    spark,
    onchain,
    source: providedSource,
    ...input
  }: Simplify<
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
  >): Task<AccountTransactionId, never, EvoluDep & EvoluOwnerIdDep & DateDep> =>
  async (run) => {
    assertHasSparkIdentifier(
      spark,
      "Spark account transaction requires lnInvoice or sparkInvoice."
    )

    const { evoluOwnerId } = run.deps
    const id =
      providedId ??
      deriveAccountTransactionId(input.accountId, { iban, spark, onchain }) ??
      createTableId<"AccountTransaction">()
    const source = providedSource
    const sourceId = createIdFromString<"AccountTransactionSource">(
      `accountTransactionSource:${id}:${source.source}`
    )

    await runMutationWithCompletion((options) => {
      let kind: AccountTransactionRow["kind"] = "cashRegister"

      if (iban) {
        kind = "iban"
        run.deps.evolu.upsert(
          "accountTransactionIban",
          removeUndefinedValues({
            ...iban,
            bankReference: iban.bankReference ?? null,
            id,
          }),
          { ...options, ownerId: evoluOwnerId }
        )
      }

      if (spark) {
        kind = "spark"
        run.deps.evolu.upsert(
          "accountTransactionSpark",
          removeUndefinedValues({
            sparkTransferId: spark.sparkTransferId,
            id,
          }),
          { ...options, ownerId: evoluOwnerId }
        )
        if (spark.lightning) {
          run.deps.evolu.upsert(
            "accountTransactionLightning",
            removeUndefinedValues({
              ...spark.lightning,
              id,
            }),
            { ...options, ownerId: evoluOwnerId }
          )
        }
        if (spark.sparkInvoice) {
          run.deps.evolu.upsert(
            "accountTransactionSparkInvoice",
            removeUndefinedValues({
              ...spark.sparkInvoice,
              id,
            }),
            { ...options, ownerId: evoluOwnerId }
          )
        }
      }

      if (onchain) {
        kind = "onchain"
        run.deps.evolu.upsert(
          "accountTransactionOnchain",
          removeUndefinedValues({
            ...onchain,
            id,
          }),
          { ...options, ownerId: evoluOwnerId }
        )
      }

      run.deps.evolu.upsert(
        "accountTransactionSource",
        removeUndefinedValues({
          ...source,
          id: sourceId,
          accountTransactionId: id,
          recordedAt:
            source.recordedAt ??
            TimestampMsSchema.decode(run.deps.date.now().getTime()),
        }),
        { ...options, ownerId: evoluOwnerId }
      )

      return run.deps.evolu.upsert(
        "accountTransaction",
        removeUndefinedValues({
          ...input,
          id,
          kind,
        }),
        { ...options, ownerId: evoluOwnerId }
      )
    })

    return ok(id)
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

    await runMutationWithCompletion((options) => {
      // Without a detail payload, keep the stored kind untouched — a partial
      // update must not reclassify an existing iban/spark transaction.
      let kind: AccountTransactionRow["kind"] | undefined

      if (iban) {
        kind = "iban"
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
        kind = "spark"
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
