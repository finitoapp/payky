import {
  type InsertValues,
  type MutationOptions,
  ok,
  sqliteFalse,
  sqliteTrue,
  type Task,
  type UpdateValues,
} from "@evolu/common"
import type { RequireExactlyOne, Simplify } from "type-fest"
import type { DateDep, EvoluOwnerIdDep, MasterKeyDep } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import { updateFioPluginAccountRow } from "@/core/modules/fio-plugin/fio-plugin-actions.ts"
import { fioPluginByIdQuery } from "@/core/modules/fio-plugin/fio-plugin-queries.ts"
import { fioPluginId } from "@/core/modules/fio-plugin/fio-plugin-utils.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/evolu-utils.ts"
import {
  deriveDefaultSparkWalletSecret,
  type SparkMnemonic,
  type SparkSecret,
  sparkMnemonicToSecret,
} from "@/core/modules/shared/key-derivation.ts"
import { getFirstOr } from "@/core/modules/shared/result.ts"
import type {
  BankQrFormat,
  FiatCurrency,
  Iban,
  TimestampMs,
} from "@/core/modules/shared/schema.ts"
import {
  NonEmptyString255,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import type {
  AccountRow,
  account,
  accountCashRegister,
  accountIban,
  accountSpark,
} from "./account.ts"
import {
  accountByIdQuery,
  cardSwitchioAccountQuery,
  cashRegisterAccountQuery,
  fiatBankAccountQuery,
  sparkAccountQuery,
} from "./account-queries.ts"
import { sparkAccountSyncPointerByAccountIdQuery } from "./account-spark-queries.ts"
import type { AccountId } from "./account-types.ts"
import {
  createCardSwitchioAccountId,
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
  }): Task<AccountId | null, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evolu, evoluOwnerId } = run.deps

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
    never,
    EvoluDep & EvoluOwnerIdDep & MasterKeyDep
  > =>
  async (run) => {
    const { evolu, evoluOwnerId, masterKey } = run.deps

    // Preloaded so enabling Spark keeps the wallet already configured rather
    // than switching back to the default one.
    const [current] = await evolu.loadQuery(sparkAccountQuery)
    const secret =
      current?.secret ??
      (enabled ? deriveDefaultSparkWalletSecret(masterKey) : undefined)
    if (secret === undefined) return ok(null)

    const id = createSparkAccountId(secret)

    // Only a legacy account whose id predates derivation differs from `id`
    // here, so this retires nothing else.
    await runMutationWithCompletion((options) =>
      upsertSparkAccountRows(
        evolu,
        { id, secret, enabled, replacedId: current?.id },
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(id)
  }

/**
 * Writes the Spark account for `secret` and retires `replacedId`, the one it
 * takes over from, so at most one Spark account stays live.
 */
const upsertSparkAccountRows = (
  evolu: EvoluDep["evolu"],
  {
    id,
    secret,
    enabled,
    replacedId,
  }: {
    readonly id: AccountId
    readonly secret: SparkSecret
    readonly enabled: boolean
    readonly replacedId: AccountId | undefined
  },
  options: MutationOptions
): void => {
  evolu.upsert("accountSpark", { id, secret }, options)

  if (replacedId !== undefined && replacedId !== id) {
    evolu.update("account", { id: replacedId, isDeleted: sqliteTrue }, options)
  }

  evolu.upsert(
    "account",
    {
      id,
      deviceId: null,
      name: NonEmptyString255("Spark account"),
      kind: "spark",
      isDeleted: enabled ? sqliteFalse : sqliteTrue,
    },
    options
  )
}

/**
 * Switches Spark payments to the wallet behind `secret`, enabling Spark if it
 * was off. The previous wallet's account is retired and stops syncing:
 * invoices it issued that are still open are no longer detected, and its
 * balance is no longer shown — which the settings page warns about before
 * calling this. Switching back later revives the same account, with its sync
 * pointer and history.
 *
 * A wallet switched to for the first time gets its sync pointer set to now,
 * so its first sync looks back only the usual 72 hours instead of importing
 * the wallet's whole history as unmatched transactions.
 */
const selectSparkWallet =
  (
    secret: SparkSecret
  ): Task<AccountId, never, EvoluDep & EvoluOwnerIdDep & DateDep> =>
  async (run) => {
    const { evolu, evoluOwnerId } = run.deps
    const id = createSparkAccountId(secret)
    const [current] = await evolu.loadQuery(sparkAccountQuery)
    const [pointer] = await evolu.loadQuery(
      sparkAccountSyncPointerByAccountIdQuery(id)
    )

    await runMutationWithCompletion((options) => {
      const mutationOptions = { ...options, ownerId: evoluOwnerId }

      upsertSparkAccountRows(
        evolu,
        { id, secret, enabled: true, replacedId: current?.id },
        mutationOptions
      )

      if (pointer === undefined) {
        evolu.upsert(
          "sparkAccountSyncPointer",
          {
            id,
            lastSyncedAt: TimestampMsSchema.decode(
              run.deps.date.now().getTime()
            ),
            isDeleted: sqliteFalse,
          },
          mutationOptions
        )
      }
    })

    return ok(id)
  }

/** Switches Spark payments to a wallet the user brings as its 12 words. */
export const selectCustomSparkWallet = ({
  mnemonic,
}: {
  readonly mnemonic: SparkMnemonic
}): Task<AccountId, never, EvoluDep & EvoluOwnerIdDep & DateDep> =>
  selectSparkWallet(sparkMnemonicToSecret(mnemonic))

/** Switches Spark payments back to the wallet derived from the master key. */
export const selectDefaultSparkWallet =
  (): Task<
    AccountId,
    never,
    EvoluDep & EvoluOwnerIdDep & DateDep & MasterKeyDep
  > =>
  async (run) =>
    await run(
      selectSparkWallet(deriveDefaultSparkWalletSecret(run.deps.masterKey))
    )

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
  }): Task<AccountId | null, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evolu, evoluOwnerId } = run.deps

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

/**
 * Enables or disables the SwitchioPay card terminal, mirroring
 * {@link saveCashRegisterAccount}. Only Android can drive the terminal (the
 * ECR protocol is intent-based), but the account itself is plain synced data
 * — the runtime gate belongs in the UI, not here.
 */
export const saveCardSwitchioAccount =
  ({
    enabled,
    currency,
  }: {
    readonly enabled: boolean
    readonly currency: FiatCurrency
  }): Task<AccountId | null, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evolu, evoluOwnerId } = run.deps

    const [current] = await evolu.loadQuery(cardSwitchioAccountQuery)

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

    const id = createCardSwitchioAccountId(currency)

    await runMutationWithCompletion((options) => {
      const mutationOptions = { ...options, ownerId: evoluOwnerId }

      evolu.upsert("accountCardSwitchio", { id, currency }, mutationOptions)

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
          name: NonEmptyString255("Card terminal"),
          kind: "cardSwitchio",
          isDeleted: sqliteFalse,
        },
        mutationOptions
      )
    })

    return ok(id)
  }
