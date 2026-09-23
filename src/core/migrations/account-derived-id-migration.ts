import {
  type InferRow,
  type KyselyNotNull,
  ok,
  sqliteFalse,
  sqliteTrue,
  type Task,
} from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { AppMigration } from "@/core/migrations/migrations.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import {
  createCashRegisterAccountId,
  createIbanAccountId,
  createSparkAccountId,
} from "@/core/modules/account/account-utils.ts"
import { updateFioPluginAccountRow } from "@/core/modules/fio-plugin/fio-plugin-actions.ts"
import { fioPluginByIdQuery } from "@/core/modules/fio-plugin/fio-plugin-queries.ts"
import { fioPluginId } from "@/core/modules/fio-plugin/fio-plugin-utils.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/evolu-utils.ts"
import { TimestampMsSchema } from "@/core/modules/shared/schema.ts"

/**
 * Every account with the detail values its id derives from, deleted ones
 * included, plus its Spark sync pointer. A handful of rows on any real
 * install, which is why `hasWork` can afford to read all of them at every
 * start.
 *
 * Oldest first, so where several legacy accounts derive to one id, the
 * newest of them is the one whose values win.
 */
const accountIdentitiesQuery = createQuery((db) =>
  db
    .selectFrom("account")
    .leftJoin("accountIban", (join) =>
      join
        .onRef("accountIban.id", "=", "account.id")
        .on("accountIban.isDeleted", "is not", sqliteTrue)
    )
    .leftJoin("accountSpark", (join) =>
      join
        .onRef("accountSpark.id", "=", "account.id")
        .on("accountSpark.isDeleted", "is not", sqliteTrue)
    )
    .leftJoin("accountCashRegister", (join) =>
      join
        .onRef("accountCashRegister.id", "=", "account.id")
        .on("accountCashRegister.isDeleted", "is not", sqliteTrue)
    )
    .leftJoin("sparkAccountSyncPointer", (join) =>
      join
        .onRef("sparkAccountSyncPointer.id", "=", "account.id")
        .on("sparkAccountSyncPointer.isDeleted", "is not", sqliteTrue)
    )
    .select([
      "account.id",
      "account.deviceId",
      "account.name",
      "account.kind",
      "account.isDeleted",
      "accountIban.iban",
      "accountIban.currency as ibanCurrency",
      "accountIban.defaultQrFormat as ibanDefaultQrFormat",
      "accountSpark.secret as sparkSecret",
      "accountCashRegister.currency as cashRegisterCurrency",
      "sparkAccountSyncPointer.lastSyncedAt as sparkLastSyncedAt",
    ])
    .where("account.id", "is not", null)
    .where("account.name", "is not", null)
    .where("account.kind", "is not", null)
    .orderBy("account.createdAt")
    .orderBy("account.id")
    .$narrowType<{
      id: KyselyNotNull
      name: KyselyNotNull
      kind: KyselyNotNull
    }>()
)

type AccountIdentityRow = InferRow<typeof accountIdentitiesQuery>

/**
 * The id an account's detail values derive to, or `null` when the detail row
 * its kind needs is missing and there is nothing to derive from.
 */
const deriveAccountId = (row: AccountIdentityRow): AccountId | null => {
  if (row.kind === "iban") {
    return row.iban === null || row.ibanCurrency === null
      ? null
      : createIbanAccountId({ iban: row.iban, currency: row.ibanCurrency })
  }
  if (row.kind === "spark") {
    return row.sparkSecret === null
      ? null
      : createSparkAccountId(row.sparkSecret)
  }
  return row.cashRegisterCurrency === null
    ? null
    : createCashRegisterAccountId(row.cashRegisterCurrency)
}

interface Plan {
  /** Legacy accounts grouped by the id they derive to, oldest first. */
  readonly legacyByDerivedId: ReadonlyMap<
    AccountId,
    ReadonlyArray<AccountIdentityRow>
  >
  /** Every account that exists, by id. */
  readonly existingById: ReadonlyMap<AccountId, AccountIdentityRow>
  /** Where the Fio plugin has to be re-pointed, if anywhere. */
  readonly fioPluginAccountId: AccountId | null
}

/**
 * What is left to do. Shared by `hasWork` and `run`, so the two cannot
 * disagree on what counts as work.
 *
 * A legacy account — one whose id is not the id its detail values derive to
 * — is work while it is still live (it has to be tombstoned) or while its
 * derived account does not exist yet (it has to be written, deleted or not,
 * so re-enabling it later finds its configuration). The Fio plugin is work
 * while it points at any legacy account.
 */
const loadPlan = (): Task<Plan | null, never, EvoluDep> => async (run) => {
  const { evolu } = run.deps
  const rows = await evolu.loadQuery(accountIdentitiesQuery)
  const [fioPlugin] = await evolu.loadQuery(fioPluginByIdQuery(fioPluginId))

  const existingById = new Map(rows.map((row) => [row.id, row]))
  const derivedIdByLegacyId = new Map<AccountId, AccountId>()
  const legacyByDerivedId = new Map<AccountId, AccountIdentityRow[]>()

  for (const row of rows) {
    const derivedId = deriveAccountId(row)
    if (derivedId === null || derivedId === row.id) continue

    derivedIdByLegacyId.set(row.id, derivedId)
    if (row.isDeleted === sqliteTrue && existingById.has(derivedId)) continue

    legacyByDerivedId.set(derivedId, [
      ...(legacyByDerivedId.get(derivedId) ?? []),
      row,
    ])
  }

  const fioPluginAccountId =
    fioPlugin === undefined
      ? null
      : (derivedIdByLegacyId.get(fioPlugin.accountId) ?? null)

  return ok(
    legacyByDerivedId.size === 0 && fioPluginAccountId === null
      ? null
      : { legacyByDerivedId, existingById, fioPluginAccountId }
  )
}

/**
 * Moves accounts still sitting at an id their detail values do not derive
 * to — the fixed singleton ids the app used before (`payky-fiat-bank-account`
 * and friends) and the random ids `createAccount` used to mint — onto their
 * derived id. Evolu row ids are the CRDT's primary key, so the rows are copied
 * and the originals tombstoned rather than renamed; payments and account
 * transactions keep referencing the legacy id as history.
 *
 * - A derived account that already exists is left as it is: it was written
 *   by this version, which makes it newer than anything the legacy row holds.
 * - Several legacy accounts deriving to one id collapse into it. The newest
 *   one's name and device win, and it stays enabled if any of them was.
 * - The Spark sync pointer is copied only where the derived account has none,
 *   so the wallet does not rescan its whole history from scratch.
 * - The Fio plugin follows the fiat bank account onto its derived id.
 *
 * Re-runnable: every id written is derived, so a repeated run writes the same
 * rows, and `loadPlan` finds nothing once it has run.
 */
export const accountDerivedIdMigration: AppMigration = {
  name: "2026-09-23-account-derived-id",
  hasWork: async (run) => ok((await run.ok(loadPlan())) !== null),
  run: async (run) => {
    const { evolu, evoluOwnerId } = run.deps
    const plan = await run.ok(loadPlan())
    if (plan === null) return ok(undefined)

    const { legacyByDerivedId, existingById, fioPluginAccountId } = plan

    await runMutationWithCompletion((options) => {
      const mutationOptions = { ...options, ownerId: evoluOwnerId }

      for (const [id, legacyRows] of legacyByDerivedId) {
        const newest = legacyRows.at(-1)
        if (newest === undefined) continue

        const existing = existingById.get(id)
        if (existing === undefined) {
          if (
            newest.kind === "iban" &&
            newest.iban !== null &&
            newest.ibanCurrency !== null
          ) {
            evolu.upsert(
              "accountIban",
              {
                id,
                iban: newest.iban,
                currency: newest.ibanCurrency,
                defaultQrFormat: newest.ibanDefaultQrFormat ?? "spayd",
              },
              mutationOptions
            )
          }
          if (newest.kind === "spark" && newest.sparkSecret !== null) {
            evolu.upsert(
              "accountSpark",
              { id, secret: newest.sparkSecret },
              mutationOptions
            )
          }
          if (
            newest.kind === "cashRegister" &&
            newest.cashRegisterCurrency !== null
          ) {
            evolu.upsert(
              "accountCashRegister",
              { id, currency: newest.cashRegisterCurrency },
              mutationOptions
            )
          }

          evolu.upsert(
            "account",
            {
              id,
              deviceId: newest.deviceId,
              name: newest.name,
              kind: newest.kind,
              isDeleted: legacyRows.every((row) => row.isDeleted === sqliteTrue)
                ? sqliteTrue
                : sqliteFalse,
            },
            mutationOptions
          )
        }

        const legacyLastSyncedAt = Math.max(
          ...legacyRows.map((row) => row.sparkLastSyncedAt ?? 0)
        )
        if (
          newest.kind === "spark" &&
          legacyLastSyncedAt > 0 &&
          (existing?.sparkLastSyncedAt ?? null) === null
        ) {
          evolu.upsert(
            "sparkAccountSyncPointer",
            {
              id,
              lastSyncedAt: TimestampMsSchema.decode(legacyLastSyncedAt),
              isDeleted: sqliteFalse,
            },
            mutationOptions
          )
        }

        for (const row of legacyRows) {
          if (row.isDeleted !== sqliteTrue) {
            evolu.update(
              "account",
              { id: row.id, isDeleted: sqliteTrue },
              mutationOptions
            )
          }
        }
      }

      if (fioPluginAccountId !== null) {
        updateFioPluginAccountRow(evolu, fioPluginAccountId, mutationOptions)
      }
    })

    return ok(undefined)
  },
}
