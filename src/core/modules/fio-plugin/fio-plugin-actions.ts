import {
  createIdFromString,
  type InsertValues,
  ok,
  sqliteFalse,
  sqliteTrue,
  type Task,
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
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import { fioPluginByIdQuery } from "./fio-plugin-queries.ts"
import type { FioPluginId } from "./fio-plugin-types.ts"
import { fioPluginId } from "./fio-plugin-utils.ts"

export const fioPluginNotFound = defineError("FioPluginNotFound")<{
  readonly id: FioPluginId
}>()
export type FioPluginNotFoundError = ReturnType<typeof fioPluginNotFound>

export const defaultFioPluginSyncLookbackDays = PositiveInteger(1)

export const loadFioPlugin =
  (
    idValue: FioPluginId
  ): Task<FioPluginRow, FioPluginNotFoundError, EvoluDep> =>
  async (run) =>
    getFirstOr(
      await run.deps.evolu.loadQuery(fioPluginByIdQuery(idValue)),
      fioPluginNotFound({ id: idValue })
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
