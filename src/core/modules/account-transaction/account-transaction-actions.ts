import {
  createIdFromString,
  type InsertValues,
  ok,
  sqliteTrue,
  type Task,
  type UpdateValues,
} from "@evolu/common"

import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  createTableId,
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import type {
  AccountTransactionRow,
  accountTransaction,
  accountTransactionIban,
  accountTransactionSpark,
} from "./account-transaction.ts"
import type { AccountTransactionId } from "./account-transaction-types.ts"

export const createAccountTransaction =
  ({
    iban,
    spark,
    ...input
  }: Omit<InsertValues<typeof accountTransaction>, "kind"> &
    (
      | {
          readonly iban: InsertValues<typeof accountTransactionIban>
          readonly spark?: never
        }
      | {
          readonly iban?: never
          readonly spark: InsertValues<typeof accountTransactionSpark>
        }
      | {
          readonly iban?: never
          readonly spark?: never
        }
    )): Task<AccountTransactionId, never, EvoluDep> =>
  async (run) => {
    const id = iban
      ? createIdFromString<"AccountTransaction">(
          `accountTransaction:iban:${input.accountId}:${iban.bankReference}`
        )
      : spark
        ? createIdFromString<"AccountTransaction">(
            `accountTransaction:spark:${spark.sparkTransferId}`
          )
        : createTableId<"AccountTransaction">()

    await runMutationWithCompletion((options) => {
      let kind: AccountTransactionRow["kind"] = "cashRegister"

      if (iban) {
        kind = "iban"
        run.deps.evolu.upsert(
          "accountTransactionIban",
          removeUndefinedValues({
            ...iban,
            id,
          }),
          options
        )
      }

      if (spark) {
        kind = "spark"
        run.deps.evolu.upsert(
          "accountTransactionSpark",
          removeUndefinedValues({
            ...spark,
            id,
          }),
          options
        )
      }

      return run.deps.evolu.upsert(
        "accountTransaction",
        removeUndefinedValues({
          ...input,
          id,
          kind,
        }),
        options
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
    | "deviceId"
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
          readonly spark: Omit<
            UpdateValues<typeof accountTransactionSpark>,
            "id"
          >
        }
      | {
          readonly iban?: never
          readonly spark?: never
        }
    )): Task<AccountTransactionId, never, EvoluDep> =>
  async (run) => {
    await runMutationWithCompletion((options) => {
      let kind: AccountTransactionRow["kind"] = "cashRegister"

      if (iban) {
        kind = "iban"
        run.deps.evolu.update(
          "accountTransactionIban",
          removeUndefinedValues({
            ...iban,
            id: input.id,
          }),
          options
        )
      }

      if (spark) {
        kind = "spark"
        run.deps.evolu.update(
          "accountTransactionSpark",
          removeUndefinedValues({
            ...spark,
            id: input.id,
          }),
          options
        )
      }

      return run.deps.evolu.update(
        "accountTransaction",
        removeUndefinedValues({
          ...input,
          kind,
        }),
        options
      )
    })

    return ok(input.id)
  }

export const deleteAccountTransaction =
  (
    idValue: AccountTransactionId
  ): Task<AccountTransactionId, never, EvoluDep> =>
  async (run) => {
    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "accountTransaction",
        {
          id: idValue,
          isDeleted: sqliteTrue,
        },
        options
      )
    )

    return ok(idValue)
  }
