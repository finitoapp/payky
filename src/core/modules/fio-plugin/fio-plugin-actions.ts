import {
  createIdFromString,
  type InsertValues,
  ok,
  sqliteFalse,
  sqliteTrue,
  type Task,
  type UpdateValues,
} from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import type {
  FioPluginRow,
  fioPlugin,
  fioPluginToken,
} from "@/core/modules/fio-plugin/fio-plugin.ts"
import type { FioPluginTokenId } from "@/core/modules/fio-plugin/fio-plugin-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { getFirstOr } from "@/core/modules/shared/result.ts"
import {
  type DateString,
  PositiveInteger,
} from "@/core/modules/shared/schema.ts"
import {
  createTableId,
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import { fioPluginByIdQuery } from "./fio-plugin-queries.ts"
import type { FioPluginId } from "./fio-plugin-types.ts"

const createFioPluginNotFoundError = defineError("FioPluginNotFound")<{
  readonly id: FioPluginId
}>()
export type FioPluginNotFoundError = ReturnType<
  typeof createFioPluginNotFoundError
>

export const fioPluginNotFound = (id: FioPluginId): FioPluginNotFoundError =>
  createFioPluginNotFoundError({ id })

export const defaultFioPluginSyncLookbackDays = PositiveInteger(1)

export const loadFioPlugin =
  (
    idValue: FioPluginId
  ): Task<FioPluginRow, FioPluginNotFoundError, EvoluDep> =>
  async (run) =>
    getFirstOr(
      await run.deps.evolu.loadQuery(fioPluginByIdQuery(idValue)),
      fioPluginNotFound(idValue)
    )

/**
 * Creates the plugin's configuration only. Tokens are added separately with
 * `addFioPluginToken`, so saving a setting can never write one as a
 * side effect. A plugin with no token yet is simply inactive — the sync job
 * filters it out (see `hasFioTokens`) until one is added.
 */
export const createFioPlugin =
  ({
    syncLookbackDays = defaultFioPluginSyncLookbackDays,
    ...input
  }: Omit<InsertValues<typeof fioPlugin>, "syncLookbackDays"> &
    Partial<Pick<InsertValues<typeof fioPlugin>, "syncLookbackDays">>): Task<
    FioPluginId,
    never,
    EvoluDep & EvoluOwnerIdDep
  > =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    const id = createTableId<"FioPlugin">()

    await runMutationWithCompletion((options) =>
      run.deps.evolu.upsert(
        "fioPlugin",
        removeUndefinedValues({
          ...input,
          id,
          syncLookbackDays,
        }),
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(id)
  }

/**
 * Adds one token to a plugin's rotation set (the sync job cycles through all
 * of a plugin's tokens — see `fio-account-transaction-sync-job.ts`).
 *
 * The row id is derived from the plugin and the token value rather than
 * generated, so re-adding a token the plugin already has is an idempotent
 * no-op. It used to be random and written from `updateFioPlugin`, which meant
 * every save of the settings form appended another row: re-saving without
 * touching the token duplicated it, and *changing* it left the old one in the
 * rotation, so the job kept periodically retrying a revoked token.
 */
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
    const id = createIdFromString<"FioPluginToken">(
      `fioPluginToken:${fioPluginId}:${token}`
    )

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

/** Configuration only; tokens are managed through `addFioPluginToken`. */
export const updateFioPlugin =
  (
    input: Pick<
      UpdateValues<typeof fioPlugin>,
      | "id"
      | "accountId"
      | "numberOfSecondsBetweenChecks"
      | "syncLookbackDays"
      | "isActive"
    >
  ): Task<FioPluginId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update("fioPlugin", removeUndefinedValues(input), {
        ...options,
        ownerId: evoluOwnerId,
      })
    )

    return ok(input.id)
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
