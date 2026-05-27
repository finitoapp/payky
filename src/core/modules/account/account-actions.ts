import {
  type InsertValues,
  type Result,
  sqliteTrue,
  type UpdateValues,
} from "@evolu/common"

import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  createTableId,
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import { type ActionError, getFirst } from "../shared/action-error.ts"
import type {
  AccountRow,
  account,
  accountCashRegister,
  accountIban,
  accountSpark,
} from "./account.ts"
import { accountByIdQuery } from "./account-queries.ts"
import type { AccountId } from "./account-types.ts"

export const loadAccount =
  (deps: EvoluDep) =>
  async (idValue: AccountId): Promise<Result<AccountRow, ActionError>> =>
    getFirst(
      await deps.evolu.loadQuery(accountByIdQuery(idValue)),
      "account",
      idValue
    )

export const createAccount =
  (deps: EvoluDep) =>
  async ({
    iban,
    spark,
    cashRegister,
    ...input
  }: Omit<InsertValues<typeof account>, "kind"> &
    (
      | {
          readonly iban: InsertValues<typeof accountIban>
          readonly spark?: never
          readonly cashRegister?: never
        }
      | {
          readonly iban?: never
          readonly spark: InsertValues<typeof accountSpark>
          readonly cashRegister?: never
        }
      | {
          readonly iban?: never
          readonly spark?: never
          readonly cashRegister: InsertValues<typeof accountCashRegister>
        }
    )): Promise<AccountId> => {
    const id = createTableId<"Account">()

    await runMutationWithCompletion((options) => {
      let kind: AccountRow["kind"] = "cashRegister"

      if (iban) {
        kind = "iban"
        deps.evolu.upsert(
          "accountIban",
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
          "accountSpark",
          removeUndefinedValues({
            ...spark,
            id,
          }),
          options
        )
      }

      if (cashRegister) {
        kind = "cashRegister"
        deps.evolu.upsert(
          "accountCashRegister",
          removeUndefinedValues({
            ...cashRegister,
            id,
          }),
          options
        )
      }

      return deps.evolu.upsert(
        "account",
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

export const updateAccount =
  (deps: EvoluDep) =>
  async ({
    iban,
    spark,
    cashRegister,
    ...input
  }: Pick<UpdateValues<typeof account>, "id" | "deviceId" | "name"> &
    (
      | {
          readonly iban: Omit<UpdateValues<typeof accountIban>, "id">
          readonly spark?: never
          readonly cashRegister?: never
        }
      | {
          readonly iban?: never
          readonly spark: Omit<UpdateValues<typeof accountSpark>, "id">
          readonly cashRegister?: never
        }
      | {
          readonly iban?: never
          readonly spark?: never
          readonly cashRegister: Omit<
            UpdateValues<typeof accountCashRegister>,
            "id"
          >
        }
    )): Promise<AccountId> => {
    await runMutationWithCompletion((options) => {
      let kind: AccountRow["kind"] = "cashRegister"

      if (iban) {
        kind = "iban"
        deps.evolu.update(
          "accountIban",
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
          "accountSpark",
          removeUndefinedValues({
            ...spark,
            id: input.id,
          }),
          options
        )
      }

      if (cashRegister) {
        kind = "cashRegister"
        deps.evolu.update(
          "accountCashRegister",
          removeUndefinedValues({
            ...cashRegister,
            id: input.id,
          }),
          options
        )
      }

      return deps.evolu.update(
        "account",
        removeUndefinedValues({
          id: input.id,
          deviceId: input.deviceId,
          name: input.name,
          kind,
        }),
        options
      )
    })

    return input.id
  }

export const deleteAccount =
  (deps: EvoluDep) =>
  async (idValue: AccountId): Promise<AccountId> => {
    await runMutationWithCompletion((options) =>
      deps.evolu.update(
        "account",
        {
          id: idValue,
          isDeleted: sqliteTrue,
        },
        options
      )
    )

    return idValue
  }
