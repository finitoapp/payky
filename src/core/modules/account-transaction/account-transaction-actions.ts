import { type InsertValues, sqliteTrue, type UpdateValues } from "@evolu/common"

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
  (deps: EvoluDep) =>
  async ({
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
    )): Promise<AccountTransactionId> => {
    const id = createTableId<"AccountTransaction">()

    await runMutationWithCompletion((options) => {
      let kind: AccountTransactionRow["kind"] = "cashRegister"

      if (iban) {
        kind = "iban"
        deps.evolu.upsert(
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
        deps.evolu.upsert(
          "accountTransactionSpark",
          removeUndefinedValues({
            ...spark,
            id,
          }),
          options
        )
      }

      return deps.evolu.upsert(
        "accountTransaction",
        removeUndefinedValues({
          ...input,
          id,
          kind,
        }),
        options
      )
    })

    return id
  }

export const updateAccountTransaction =
  (deps: EvoluDep) =>
  async ({
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
    )): Promise<AccountTransactionId> => {
    await runMutationWithCompletion((options) => {
      let kind: AccountTransactionRow["kind"] = "cashRegister"

      if (iban) {
        kind = "iban"
        deps.evolu.update(
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
        deps.evolu.update(
          "accountTransactionSpark",
          removeUndefinedValues({
            ...spark,
            id: input.id,
          }),
          options
        )
      }

      return deps.evolu.update(
        "accountTransaction",
        removeUndefinedValues({
          ...input,
          kind,
        }),
        options
      )
    })

    return input.id
  }

export const deleteAccountTransaction =
  (deps: EvoluDep) =>
  async (idValue: AccountTransactionId): Promise<AccountTransactionId> => {
    await runMutationWithCompletion((options) =>
      deps.evolu.update(
        "accountTransaction",
        {
          id: idValue,
          isDeleted: sqliteTrue,
        },
        options
      )
    )

    return idValue
  }
