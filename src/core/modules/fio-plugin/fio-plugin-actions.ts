import {
  createIdFromString,
  type InsertValues,
  type MutationOptions,
  ok,
  sqliteFalse,
  sqliteTrue,
  type Task,
} from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import { fiatBankAccountQuery } from "@/core/modules/account/account-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { legacyFiatBankAccountId } from "@/core/modules/account/account-utils.ts"
import type {
  FioPluginRow,
  fioPlugin,
  fioPluginToken,
} from "@/core/modules/fio-plugin/fio-plugin.ts"
import type { FioPluginTokenId } from "@/core/modules/fio-plugin/fio-plugin-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/evolu-utils.ts"
import { getFirstOr } from "@/core/modules/shared/result.ts"
import type { NonEmptyString255 } from "@/core/modules/shared/schema.ts"
import {
  type DateString,
  PositiveInteger,
} from "@/core/modules/shared/schema.ts"
import {
  fioPluginByIdQuery,
  fioPluginSyncPointerByPluginIdQuery,
  legacyFioPluginsQuery,
} from "./fio-plugin-queries.ts"
import type { FioPluginId } from "./fio-plugin-types.ts"
import { fioPluginId } from "./fio-plugin-utils.ts"

export const createFioPluginNotFoundError = defineError("FioPluginNotFound")<{
  readonly id: FioPluginId
}>()
export type FioPluginNotFoundError = ReturnType<
  typeof createFioPluginNotFoundError
>

export const defaultFioPluginSyncLookbackDays = PositiveInteger(1)

export const loadFioPlugin =
  (
    idValue: FioPluginId
  ): Task<FioPluginRow, FioPluginNotFoundError, EvoluDep> =>
  async (run) =>
    getFirstOr(
      await run.deps.evolu.loadQuery(fioPluginByIdQuery(idValue)),
      createFioPluginNotFoundError({ id: idValue })
    )

/**
 * Upserts the singleton `fioPlugin` row — the one action behind both "create"
 * and "save", since the id is fixed (`fioPluginId`) and a missing row just
 * means the integration is off. Callers no longer branch on whether it exists,
 * and nothing about the settings page is keyed to an id that only appears
 * after the first write.
 *
 * Tokens are deliberately not part of this: they are managed through
 * `addFioPluginToken`/`deleteFioPluginToken`, so saving a setting can never
 * write one as a side effect. They can also be saved before this row exists —
 * `activeFioPluginsQuery` inner-joins `fioPlugin`, so they sit unused until it
 * does.
 */
export const saveFioPlugin =
  ({
    syncLookbackDays = defaultFioPluginSyncLookbackDays,
    ...input
  }: Omit<InsertValues<typeof fioPlugin>, "id" | "syncLookbackDays"> &
    Partial<Pick<InsertValues<typeof fioPlugin>, "syncLookbackDays">>): Task<
    FioPluginId,
    never,
    EvoluDep & EvoluOwnerIdDep
  > =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.upsert(
        "fioPlugin",
        removeUndefinedValues({
          ...input,
          id: fioPluginId,
          syncLookbackDays,
          isDeleted: sqliteFalse,
        }),
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(fioPluginId)
  }

/**
 * Token rows are addressed by their value rather than a generated id, so
 * adding a token the plugin already has is a no-op instead of a second entry
 * in the sync job's rotation. `migrateLegacyFioPlugins` derives the same id to
 * re-key a legacy plugin's tokens onto `fioPluginId`.
 */
export const createFioPluginTokenId = ({
  fioPluginId,
  token,
}: {
  readonly fioPluginId: FioPluginId
  readonly token: NonEmptyString255
}): FioPluginTokenId =>
  createIdFromString<"FioPluginToken">(`fioPluginToken:${fioPluginId}:${token}`)

export const addFioPluginToken =
  ({
    fioPluginId,
    token,
  }: {
    readonly fioPluginId: FioPluginId
    readonly token: InsertValues<typeof fioPluginToken>["token"]
  }): Task<FioPluginTokenId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    const id = createFioPluginTokenId({ fioPluginId, token })

    await runMutationWithCompletion((options) =>
      run.deps.evolu.upsert(
        "fioPluginToken",
        {
          id,
          fioPluginId,
          token,
          // Explicitly un-deleted so re-adding a token the staff removed
          // earlier revives that row instead of staying invisible; the token
          // queries match on `isDeleted is not 1` for the same reason.
          isDeleted: sqliteFalse,
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(id)
  }

export const updateFioPluginSyncPointer =
  ({
    id,
    lastSyncedDate,
  }: {
    readonly id: FioPluginId
    readonly lastSyncedDate: DateString | null
  }): Task<FioPluginId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) => {
      if (lastSyncedDate === null) {
        return run.deps.evolu.update(
          "fioPluginSyncPointer",
          {
            id,
            isDeleted: sqliteTrue,
          },
          { ...options, ownerId: evoluOwnerId }
        )
      }

      return run.deps.evolu.upsert(
        "fioPluginSyncPointer",
        {
          id,
          lastSyncedDate,
          isDeleted: sqliteFalse,
        },
        { ...options, ownerId: evoluOwnerId }
      )
    })

    return ok(id)
  }

/**
 * Points the Fio plugin at another fiat bank account. The account's id
 * derives from its IBAN and currency, so changing either makes it a new
 * account, and the plugin has to follow it there. A plain write taking the
 * caller's `MutationOptions`, so the account module can fold it into the
 * batch that replaces the account.
 */
export const updateFioPluginAccountRow = (
  evolu: EvoluDep["evolu"],
  accountId: AccountId,
  options: MutationOptions
): void => {
  evolu.update("fioPlugin", { id: fioPluginId, accountId }, options)
}

export const deleteFioPlugin =
  (
    idValue: FioPluginId
  ): Task<FioPluginId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "fioPlugin",
        {
          id: idValue,
          isDeleted: sqliteTrue,
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(idValue)
  }

export const deleteFioPluginToken =
  (
    idValue: FioPluginTokenId
  ): Task<FioPluginTokenId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "fioPluginToken",
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
 * Re-points a Fio plugin left at a generated id onto the fixed `fioPluginId`.
 *
 * Before the plugin became a singleton, `createFioPlugin` minted a random id
 * per row. Installs that configured the integration back then still hold that
 * row, and their tokens and sync pointer are keyed to it — so the settings
 * page, which reads the fixed id, showed no tokens at all and a save wrote a
 * second plugin the sync job then ignored for having none. Evolu row ids are
 * the CRDT's primary key, so the rows are copied across and the originals
 * tombstoned rather than renamed.
 *
 * What wins where the two overlap:
 *
 * - Settings already at the fixed id stay. Reaching this with both rows
 *   present means the user saved the form after updating, and that save is
 *   newer than anything the legacy row still holds.
 * - Tokens are adopted from *every* legacy row, since dropping one silently
 *   revokes a working token. Their ids derive from the value, so a token the
 *   fixed id already has collapses into the same row.
 * - The sync pointer is adopted only if the fixed id has none, so an already
 *   synced position is never rewound.
 *
 * Idempotent: `legacyFioPluginsQuery` is empty once this has run, so callers
 * can drive it straight off that query.
 */
export const migrateLegacyFioPlugins =
  (): Task<ReadonlyArray<FioPluginId>, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evolu, evoluOwnerId } = run.deps
    const legacyPlugins = await evolu.loadQuery(legacyFioPluginsQuery)
    const [newestLegacy] = legacyPlugins
    if (newestLegacy === undefined) return ok([])

    const [current] = await evolu.loadQuery(fioPluginByIdQuery(fioPluginId))
    const [bankAccount] = await evolu.loadQuery(fiatBankAccountQuery)
    const [currentPointer] = await evolu.loadQuery(
      fioPluginSyncPointerByPluginIdQuery(fioPluginId)
    )
    const [legacyPointer] = await evolu.loadQuery(
      fioPluginSyncPointerByPluginIdQuery(newestLegacy.id)
    )

    await runMutationWithCompletion((options) => {
      const mutationOptions = { ...options, ownerId: evoluOwnerId }

      if (current === undefined) {
        evolu.upsert(
          "fioPlugin",
          removeUndefinedValues({
            id: fioPluginId,
            accountId: bankAccount?.id ?? legacyFiatBankAccountId,
            numberOfSecondsBetweenChecks:
              newestLegacy.numberOfSecondsBetweenChecks,
            syncLookbackDays:
              newestLegacy.syncLookbackDays ?? defaultFioPluginSyncLookbackDays,
            isActive: newestLegacy.isActive,
            isDeleted: sqliteFalse,
          }),
          mutationOptions
        )
      }

      if (currentPointer === undefined && legacyPointer !== undefined) {
        evolu.upsert(
          "fioPluginSyncPointer",
          {
            id: fioPluginId,
            lastSyncedDate: legacyPointer.lastSyncedDate,
            isDeleted: sqliteFalse,
          },
          mutationOptions
        )
      }

      for (const plugin of legacyPlugins) {
        for (const legacyToken of plugin.tokens) {
          evolu.upsert(
            "fioPluginToken",
            {
              id: createFioPluginTokenId({
                fioPluginId,
                token: legacyToken.token,
              }),
              fioPluginId,
              token: legacyToken.token,
              isDeleted: sqliteFalse,
            },
            mutationOptions
          )
          evolu.update(
            "fioPluginToken",
            { id: legacyToken.id, isDeleted: sqliteTrue },
            mutationOptions
          )
        }

        // The legacy sync pointer is left where it is: it is addressed by the
        // plugin id that is going away, so nothing can read it again.
        evolu.update(
          "fioPlugin",
          { id: plugin.id, isDeleted: sqliteTrue },
          mutationOptions
        )
      }
    })

    return ok(legacyPlugins.map((plugin) => plugin.id))
  }
