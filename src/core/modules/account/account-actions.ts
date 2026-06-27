import {
  type InsertValues,
  ok,
  sqliteFalse,
  sqliteTrue,
  type Task,
  type UpdateValues,
} from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { getFirstOr } from "@/core/modules/shared/result.ts"
import type {
  BankQrFormat,
  FiatCurrency,
  Iban,
} from "@/core/modules/shared/schema.ts"
import { NonEmptyString255 } from "@/core/modules/shared/schema.ts"
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
import {
  cashRegisterAccountId,
  fiatBankAccountId,
  sparkAccountId,
} from "./account-utils.ts"

type AccountIbanCreateInput = Omit<
  InsertValues<typeof accountIban>,
  "defaultQrFormat"
> & {
  readonly defaultQrFormat?: BankQrFormat
}

type AccountIbanUpdateInput = Omit<
  UpdateValues<typeof accountIban>,
  "id" | "defaultQrFormat"
> & {
  readonly defaultQrFormat?: BankQrFormat
}

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
          readonly iban: AccountIbanCreateInput
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
    )): Task<AccountId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps
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
            defaultQrFormat: iban.defaultQrFormat ?? "spayd",
          }),
          { ...options, ownerId: evoluOwnerId }
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
          { ...options, ownerId: evoluOwnerId }
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
          { ...options, ownerId: evoluOwnerId }
        )
      }

      return run.deps.evolu.upsert(
        "account",
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

export const updateAccount =
  ({
    iban,
    spark,
    cashRegister,
    ...input
  }: Pick<UpdateValues<typeof account>, "id" | "deviceId" | "name"> &
    (
      | {
          readonly iban: AccountIbanUpdateInput
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
    )): Task<AccountId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) => {
      let kind: AccountRow["kind"] = "cashRegister"

      if (iban) {
        kind = "iban"
        run.deps.evolu.update(
          "accountIban",
          removeUndefinedValues({
            ...iban,
            id: input.id,
            defaultQrFormat: iban.defaultQrFormat ?? "spayd",
          }),
          { ...options, ownerId: evoluOwnerId }
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
          { ...options, ownerId: evoluOwnerId }
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
          { ...options, ownerId: evoluOwnerId }
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
        { ...options, ownerId: evoluOwnerId }
      )
    })

    return ok(input.id)
  }

export const deleteAccount =
  (idValue: AccountId): Task<AccountId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "account",
        {
          id: idValue,
          isDeleted: sqliteTrue,
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(idValue)
  }

export const saveFiatBankAccount =
  ({
    enabled,
    iban,
    currency,
    defaultQrFormat,
  }: {
    readonly enabled: boolean
    readonly iban?: Iban
    readonly currency: FiatCurrency
    readonly defaultQrFormat?: BankQrFormat
  }): Task<AccountId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) => {
      if (iban !== undefined) {
        run.deps.evolu.upsert(
          "accountIban",
          removeUndefinedValues({
            id: fiatBankAccountId,
            iban,
            currency,
            defaultQrFormat: defaultQrFormat ?? "spayd",
          }),
          { ...options, ownerId: evoluOwnerId }
        )
      }

      return run.deps.evolu.upsert(
        "account",
        {
          id: fiatBankAccountId,
          deviceId: null,
          name: NonEmptyString255("Fiat bank account"),
          kind: "iban",
          isDeleted: enabled ? sqliteFalse : sqliteTrue,
        },
        { ...options, ownerId: evoluOwnerId }
      )
    })

    return ok(fiatBankAccountId)
  }

export const saveSparkAccount =
  ({
    enabled,
    mnemonic,
  }: {
    readonly enabled: boolean
    readonly mnemonic?: NonEmptyString255
  }): Task<AccountId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) => {
      if (mnemonic !== undefined) {
        run.deps.evolu.upsert(
          "accountSpark",
          removeUndefinedValues({
            id: sparkAccountId,
            mnemonic,
          }),
          { ...options, ownerId: evoluOwnerId }
        )
      }

      return run.deps.evolu.upsert(
        "account",
        {
          id: sparkAccountId,
          deviceId: null,
          name: NonEmptyString255("Spark account"),
          kind: "spark",
          isDeleted: enabled ? sqliteFalse : sqliteTrue,
        },
        { ...options, ownerId: evoluOwnerId }
      )
    })

    return ok(sparkAccountId)
  }

export const saveCashRegisterAccount =
  ({
    enabled,
    currency,
  }: {
    readonly enabled: boolean
    readonly currency: FiatCurrency
  }): Task<AccountId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) => {
      if (enabled) {
        run.deps.evolu.upsert(
          "accountCashRegister",
          removeUndefinedValues({
            id: cashRegisterAccountId,
            currency,
          }),
          { ...options, ownerId: evoluOwnerId }
        )

        run.deps.evolu.upsert(
          "account",
          {
            id: cashRegisterAccountId,
            deviceId: null,
            name: NonEmptyString255("Cash register"),
            kind: "cashRegister",
            isDeleted: sqliteFalse,
          },
          { ...options, ownerId: evoluOwnerId }
        )
      } else {
        run.deps.evolu.update(
          "account",
          {
            id: cashRegisterAccountId,
            isDeleted: sqliteTrue,
          },
          { ...options, ownerId: evoluOwnerId }
        )
      }
    })

    return ok(cashRegisterAccountId)
  }
