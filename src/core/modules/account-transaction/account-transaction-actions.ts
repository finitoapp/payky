import {
  createIdFromString,
  type InsertValues,
  ok,
  sqliteTrue,
  type Task,
  type UpdateValues,
} from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import type { NonEmptyString255 } from "@/core/modules/shared/schema.ts"
import {
  createTableId,
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import type {
  AccountTransactionRow,
  accountTransaction,
  accountTransactionIban,
  accountTransactionLightning,
  accountTransactionSource,
  accountTransactionSpark,
  accountTransactionSparkInvoice,
} from "./account-transaction.ts"
import type { AccountTransactionId } from "./account-transaction-types.ts"

const hasSparkTransactionIdentifier = ({
  sparkInvoice,
  lightning,
}: {
  readonly lightning?: object
  readonly sparkInvoice?: object
}): boolean => lightning !== undefined || sparkInvoice !== undefined

type AccountTransactionSparkInput = InsertValues<
  typeof accountTransactionSpark
> & {
  readonly lightning?: Omit<
    InsertValues<typeof accountTransactionLightning>,
    "id"
  >
  readonly sparkInvoice?: Omit<
    InsertValues<typeof accountTransactionSparkInvoice>,
    "id"
  >
}

type AccountTransactionSparkUpdateInput = Omit<
  UpdateValues<typeof accountTransactionSpark>,
  "id"
> & {
  readonly lightning?: Omit<
    UpdateValues<typeof accountTransactionLightning>,
    "id"
  >
  readonly sparkInvoice?: Omit<
    UpdateValues<typeof accountTransactionSparkInvoice>,
    "id"
  >
}

export const createAccountTransaction =
  ({
    id: providedId,
    iban,
    spark,
    source: providedSource,
    ...input
  }: Omit<InsertValues<typeof accountTransaction>, "kind"> & {
    readonly id?: AccountTransactionId
    readonly source: Omit<
      InsertValues<typeof accountTransactionSource>,
      "id" | "accountTransactionId" | "recordedAt"
    > & {
      readonly recordedAt?: InsertValues<
        typeof accountTransactionSource
      >["recordedAt"]
    }
  } & (
      | {
          readonly iban: Omit<
            InsertValues<typeof accountTransactionIban>,
            "bankReference"
          > & {
            readonly bankReference?: NonEmptyString255 | null
          }
          readonly spark?: never
        }
      | {
          readonly iban?: never
          readonly spark: AccountTransactionSparkInput
        }
      | {
          readonly iban?: never
          readonly spark?: never
        }
    )): Task<AccountTransactionId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    if (spark && !hasSparkTransactionIdentifier(spark)) {
      throw new Error(
        "Spark account transaction requires lnInvoice or sparkInvoice."
      )
    }

    const { evoluOwnerId } = run.deps
    const id =
      providedId ??
      (iban
        ? iban.bankReference == null
          ? createTableId<"AccountTransaction">()
          : createIdFromString<"AccountTransaction">(
              `accountTransaction:iban:${input.accountId}:${iban.bankReference}`
            )
        : spark
          ? createIdFromString<"AccountTransaction">(
              `accountTransaction:spark:${spark.sparkTransferId}`
            )
          : createTableId<"AccountTransaction">())
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

      run.deps.evolu.upsert(
        "accountTransactionSource",
        removeUndefinedValues({
          ...source,
          id: sourceId,
          accountTransactionId: id,
          recordedAt: source.recordedAt ?? Date.now(),
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
  }: Pick<
    UpdateValues<typeof accountTransaction>,
    | "id"
    | "accountId"
    | "amount"
    | "currency"
    | "occurredAt"
    | "note"
    | "internalTransferGroupId"
  > &
    (
      | {
          readonly iban: Omit<UpdateValues<typeof accountTransactionIban>, "id">
          readonly spark?: never
        }
      | {
          readonly iban?: never
          readonly spark: AccountTransactionSparkUpdateInput
        }
      | {
          readonly iban?: never
          readonly spark?: never
        }
    )): Task<AccountTransactionId, never, EvoluDep & EvoluOwnerIdDep> =>
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
