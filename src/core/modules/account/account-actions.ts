import {
  type InsertValues,
  ok,
  sqliteTrue,
  type Task,
  type UpdateValues,
} from "@evolu/common"

import { defineError } from "@/core/error.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { getFirstOr } from "@/core/modules/shared/result.ts"
import {
  createTableId,
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import type {
  AccountRow,
  account,
  accountCashRegister,
  accountIban,
  accountSpark,
} from "./account.ts"
import { accountByIdQuery } from "./account-queries.ts"
import type { AccountId } from "./account-types.ts"

const createAccountNotFoundError = defineError("AccountNotFound")<{
  readonly id: AccountId
}>()
export type AccountNotFoundError = ReturnType<typeof createAccountNotFoundError>

export const accountNotFound = (id: AccountId): AccountNotFoundError =>
  createAccountNotFoundError({ id })

export const loadAccount =
  (idValue: AccountId): Task<AccountRow, AccountNotFoundError, EvoluDep> =>
  async (run) =>
    getFirstOr(
      await run.deps.evolu.loadQuery(accountByIdQuery(idValue)),
      accountNotFound(idValue)
    )

export const createAccount =
  ({
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
    )): Task<AccountId, never, EvoluDep> =>
  async (run) => {
    const id = createTableId<"Account">()

    await runMutationWithCompletion((options) => {
      let kind: AccountRow["kind"] = "cashRegister"

      if (iban) {
        kind = "iban"
        run.deps.evolu.upsert(
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
        run.deps.evolu.upsert(
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
        run.deps.evolu.upsert(
          "accountCashRegister",
          removeUndefinedValues({
            ...cashRegister,
            id,
          }),
          options
        )
      }

      return run.deps.evolu.upsert(
        "account",
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

export const updateAccount =
  ({
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
    )): Task<AccountId, never, EvoluDep> =>
  async (run) => {
    await runMutationWithCompletion((options) => {
      let kind: AccountRow["kind"] = "cashRegister"

      if (iban) {
        kind = "iban"
        run.deps.evolu.update(
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
        run.deps.evolu.update(
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
        run.deps.evolu.update(
          "accountCashRegister",
          removeUndefinedValues({
            ...cashRegister,
            id: input.id,
          }),
          options
        )
      }

      return run.deps.evolu.update(
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

    return ok(input.id)
  }

export const deleteAccount =
  (idValue: AccountId): Task<AccountId, never, EvoluDep> =>
  async (run) => {
    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "account",
        {
          id: idValue,
          isDeleted: sqliteTrue,
        },
        options
      )
    )

    return ok(idValue)
  }
