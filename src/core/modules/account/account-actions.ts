import {
  err,
  type InsertValues,
  ok,
  sqliteFalse,
  sqliteTrue,
  type Task,
  type UpdateValues,
} from "@evolu/common"
import type { RequireExactlyOne, Simplify } from "type-fest"
import type { EvoluOwnerIdDep, MasterKeyDep } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import type { DefaultPaymentMethod } from "@/core/modules/app-settings/app-settings-types.ts"
import { updateFioPluginAccountRow } from "@/core/modules/fio-plugin/fio-plugin-actions.ts"
import { fioPluginByIdQuery } from "@/core/modules/fio-plugin/fio-plugin-queries.ts"
import { fioPluginId } from "@/core/modules/fio-plugin/fio-plugin-utils.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/evolu-utils.ts"
import { deriveDefaultSparkWalletSecret } from "@/core/modules/shared/key-derivation.ts"
import { getFirstOr } from "@/core/modules/shared/result.ts"
import type {
  BankQrFormat,
  FiatCurrency,
  Iban,
  TimestampMs,
} from "@/core/modules/shared/schema.ts"
import { NonEmptyString255 } from "@/core/modules/shared/schema.ts"
import type {
  AccountRow,
  account,
  accountCashRegister,
  accountIban,
  accountSpark,
} from "./account.ts"
import {
  accountByIdQuery,
  cashRegisterAccountQuery,
  fiatBankAccountQuery,
  sparkAccountQuery,
} from "./account-queries.ts"
import type { AccountId } from "./account-types.ts"
import {
  createCashRegisterAccountId,
  createIbanAccountId,
  createSparkAccountId,
} from "./account-utils.ts"

type AccountIbanCreateInput = Omit<
  InsertValues<typeof accountIban>,
  "defaultQrFormat"
> & {
  readonly defaultQrFormat?: BankQrFormat
}

// `iban` and `currency` are left out because the account id derives from
// them — see `createIbanAccountId`.
type AccountIbanUpdateInput = Omit<
  UpdateValues<typeof accountIban>,
  "id" | "iban" | "currency" | "defaultQrFormat"
> & {
  readonly defaultQrFormat?: BankQrFormat
}

export const createAccountNotFoundError = defineError("AccountNotFound")<{
  readonly id: AccountId
}>()
export type AccountNotFoundError = ReturnType<typeof createAccountNotFoundError>

const defaultPaymentMethodCannotBeDisabledError = defineError(
  "DefaultPaymentMethodCannotBeDisabled"
)<{ readonly method: DefaultPaymentMethod }>()
export type DefaultPaymentMethodCannotBeDisabledError = ReturnType<
  typeof defaultPaymentMethodCannotBeDisabledError
>

const preventDefaultPaymentMethodDisable =
  (
    method: DefaultPaymentMethod
  ): Task<void, DefaultPaymentMethodCannotBeDisabledError, EvoluDep> =>
  async (run) => {
    const [settings] = await run.deps.evolu.loadQuery(settingsQuery)

    return settings?.defaultPaymentMethod === method
      ? err(defaultPaymentMethodCannotBeDisabledError({ method }))
      : ok(undefined)
  }

export const loadAccount =
  (idValue: AccountId): Task<AccountRow, AccountNotFoundError, EvoluDep> =>
  async (run) =>
    getFirstOr(
      await run.deps.evolu.loadQuery(accountByIdQuery(idValue)),
      createAccountNotFoundError({ id: idValue })
    )

/**
 * Which kind of account a write describes, from the one detail payload it
 * carries. Both `createAccount` and `updateAccount` take
 * `RequireExactlyOne`, so exactly one key is present and the order these are
 * checked in cannot matter; it is a plain function of the input rather than
 * something to accumulate while writing rows.
 */
const deriveAccountKind = (detail: {
  readonly iban?: unknown
  readonly spark?: unknown
  readonly cashRegister?: unknown
}): AccountRow["kind"] => {
  if (detail.iban) return "iban"
  if (detail.spark) return "spark"
  return "cashRegister"
}

const deriveNewAccountId = (
  detail: RequireExactlyOne<{
    iban: { readonly iban: Iban; readonly currency: FiatCurrency }
    spark: InsertValues<typeof accountSpark>
    cashRegister: InsertValues<typeof accountCashRegister>
  }>
): AccountId => {
  if (detail.iban) return createIbanAccountId(detail.iban)
  if (detail.spark) return createSparkAccountId(detail.spark.secret)
  return createCashRegisterAccountId(detail.cashRegister.currency)
}

/**
 * Writes the account its detail values derive to, reviving it when it was
 * deleted — creating an account that already exists is the same account,
 * not a second one.
 */
export const createAccount =
  (
    input: Simplify<
      Omit<InsertValues<typeof account>, "kind"> &
        RequireExactlyOne<{
          iban: AccountIbanCreateInput
          spark: InsertValues<typeof accountSpark>
          cashRegister: InsertValues<typeof accountCashRegister>
        }>
    >
  ): Task<AccountId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    const { iban, spark, cashRegister, ...root } = input
    const id = deriveNewAccountId(input)

    const kind = deriveAccountKind({ iban, spark, cashRegister })

    await runMutationWithCompletion((options) => {
      if (iban) {
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
          ...root,
          id,
          kind,
          isDeleted: sqliteFalse,
        }),
        { ...options, ownerId: evoluOwnerId }
      )
    })

    return ok(id)
  }

/**
 * Edits what an account's id does not derive from. The Spark secret, the
 * IBAN and currency, and the cash register currency are not accepted here:
 * a different value is a different account, so it goes through
 * `createAccount` (or the `save*Account` actions) instead.
 */
export const updateAccount =
  ({
    iban,
    spark,
    cashRegister,
    ...input
  }: Simplify<
    Pick<UpdateValues<typeof account>, "id" | "deviceId" | "name"> &
      RequireExactlyOne<{
        iban: AccountIbanUpdateInput
        spark: Omit<UpdateValues<typeof accountSpark>, "id" | "secret">
        cashRegister: Omit<
          UpdateValues<typeof accountCashRegister>,
          "id" | "currency"
        >
      }>
  >): Task<AccountId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    const kind = deriveAccountKind({ iban, spark, cashRegister })

    await runMutationWithCompletion((options) => {
      if (iban) {
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

/**
 * Saves the fiat bank account the settings configure.
 *
 * Its id derives from the IBAN and currency, so a save that changes either
 * writes a different account. The one it replaces is retired in the same
 * batch, and the Fio plugin — which always follows the fiat bank account —
 * is re-pointed with it. Returns `null` when no IBAN was ever configured and
 * none is given, as there is no account to write yet.
 */
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
  }): Task<
    AccountId | null,
    DefaultPaymentMethodCannotBeDisabledError,
    EvoluDep & EvoluOwnerIdDep
  > =>
  async (run) => {
    const { evolu, evoluOwnerId } = run.deps

    if (!enabled) {
      const allowed = await run(preventDefaultPaymentMethodDisable("iban"))
      if (!allowed.ok) return allowed
    }

    const [current] = await evolu.loadQuery(fiatBankAccountQuery)
    const nextIban = iban ?? current?.iban
    if (nextIban === undefined) return ok(null)

    const id = createIbanAccountId({ iban: nextIban, currency })
    const [fioPlugin] = await evolu.loadQuery(fioPluginByIdQuery(fioPluginId))

    await runMutationWithCompletion((options) => {
      const mutationOptions = { ...options, ownerId: evoluOwnerId }

      evolu.upsert(
        "accountIban",
        {
          id,
          iban: nextIban,
          currency,
          defaultQrFormat:
            defaultQrFormat ?? current?.defaultQrFormat ?? "spayd",
        },
        mutationOptions
      )

      if (current !== undefined && current.id !== id) {
        evolu.update(
          "account",
          { id: current.id, isDeleted: sqliteTrue },
          mutationOptions
        )
      }

      if (fioPlugin !== undefined && fioPlugin.accountId !== id) {
        updateFioPluginAccountRow(evolu, id, mutationOptions)
      }

      return evolu.upsert(
        "account",
        {
          id,
          deviceId: null,
          name: NonEmptyString255("Fiat bank account"),
          kind: "iban",
          isDeleted: enabled ? sqliteFalse : sqliteTrue,
        },
        mutationOptions
      )
    })

    return ok(id)
  }

/**
 * Saves the Spark account the settings configure, keeping whichever wallet it
 * already has and deriving the default one from the master key only when it
 * has none yet. Returns `null` when disabling a Spark account that never
 * existed, as there is nothing to write.
 */
export const saveSparkAccount =
  ({
    enabled,
  }: {
    readonly enabled: boolean
  }): Task<
    AccountId | null,
    DefaultPaymentMethodCannotBeDisabledError,
    EvoluDep & EvoluOwnerIdDep & MasterKeyDep
  > =>
  async (run) => {
    const { evolu, evoluOwnerId, masterKey } = run.deps

    if (!enabled) {
      const allowed = await run(preventDefaultPaymentMethodDisable("spark"))
      if (!allowed.ok) return allowed
    }

    // Preloaded so enabling Spark keeps the wallet already configured rather
    // than switching back to the default one.
    const [current] = await evolu.loadQuery(sparkAccountQuery)
    const secret =
      current?.secret ??
      (enabled ? deriveDefaultSparkWalletSecret(masterKey) : undefined)
    if (secret === undefined) return ok(null)

    const id = createSparkAccountId(secret)

    await runMutationWithCompletion((options) => {
      const mutationOptions = { ...options, ownerId: evoluOwnerId }

      evolu.upsert("accountSpark", { id, secret }, mutationOptions)

      // Only a legacy account whose id predates derivation differs here.
      if (current !== undefined && current.id !== id) {
        evolu.update(
          "account",
          { id: current.id, isDeleted: sqliteTrue },
          mutationOptions
        )
      }

      return evolu.upsert(
        "account",
        {
          id,
          deviceId: null,
          name: NonEmptyString255("Spark account"),
          kind: "spark",
          isDeleted: enabled ? sqliteFalse : sqliteTrue,
        },
        mutationOptions
      )
    })

    return ok(id)
  }

/**
 * Saves the cash register the settings configure. Its id derives from the
 * currency, so enabling it in a different currency writes a different
 * account and retires the previous one in the same batch. Returns `null` when
 * disabling a cash register that never existed.
 */
export const saveCashRegisterAccount =
  ({
    enabled,
    currency,
  }: {
    readonly enabled: boolean
    readonly currency: FiatCurrency
  }): Task<
    AccountId | null,
    DefaultPaymentMethodCannotBeDisabledError,
    EvoluDep & EvoluOwnerIdDep
  > =>
  async (run) => {
    const { evolu, evoluOwnerId } = run.deps

    if (!enabled) {
      const allowed = await run(
        preventDefaultPaymentMethodDisable("cashRegister")
      )
      if (!allowed.ok) return allowed
    }

    const [current] = await evolu.loadQuery(cashRegisterAccountQuery)

    if (!enabled) {
      if (current === undefined) return ok(null)

      await runMutationWithCompletion((options) =>
        evolu.update(
          "account",
          { id: current.id, isDeleted: sqliteTrue },
          { ...options, ownerId: evoluOwnerId }
        )
      )

      return ok(current.id)
    }

    const id = createCashRegisterAccountId(currency)

    await runMutationWithCompletion((options) => {
      const mutationOptions = { ...options, ownerId: evoluOwnerId }

      evolu.upsert("accountCashRegister", { id, currency }, mutationOptions)

      if (current !== undefined && current.id !== id) {
        evolu.update(
          "account",
          { id: current.id, isDeleted: sqliteTrue },
          mutationOptions
        )
      }

      return evolu.upsert(
        "account",
        {
          id,
          deviceId: null,
          name: NonEmptyString255("Cash register"),
          kind: "cashRegister",
          isDeleted: sqliteFalse,
        },
        mutationOptions
      )
    })

    return ok(id)
  }

/**
 * Updates or resets the Spark sync job's per-account high-water mark —
 * mirrors `updateFioPluginSyncPointer`. `null` soft-deletes the pointer row,
 * which makes the next sync a cold start (unbounded full history scan)
 * instead of resuming from a 72h lookback window.
 */
export const updateSparkAccountSyncPointer =
  ({
    id,
    lastSyncedAt,
  }: {
    readonly id: AccountId
    readonly lastSyncedAt: TimestampMs | null
  }): Task<AccountId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) => {
      if (lastSyncedAt === null) {
        return run.deps.evolu.update(
          "sparkAccountSyncPointer",
          {
            id,
            isDeleted: sqliteTrue,
          },
          { ...options, ownerId: evoluOwnerId }
        )
      }

      return run.deps.evolu.upsert(
        "sparkAccountSyncPointer",
        {
          id,
          lastSyncedAt,
          isDeleted: sqliteFalse,
        },
        { ...options, ownerId: evoluOwnerId }
      )
    })

    return ok(id)
  }
