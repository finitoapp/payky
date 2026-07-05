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

export const createFioPlugin =
  ({
    token,
    syncLookbackDays = defaultFioPluginSyncLookbackDays,
    ...input
  }: Omit<InsertValues<typeof fioPlugin>, "syncLookbackDays"> &
    Partial<Pick<InsertValues<typeof fioPlugin>, "syncLookbackDays">> & {
      readonly token: InsertValues<typeof fioPluginToken>["token"]
    }): Task<FioPluginId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    const id = createTableId<"FioPlugin">()
    const tokenId = createTableId<"FioPluginToken">()

    await runMutationWithCompletion((options) => {
      run.deps.evolu.upsert(
        "fioPluginToken",
        removeUndefinedValues({
          id: tokenId,
          fioPluginId: id,
          token,
        }),
        { ...options, ownerId: evoluOwnerId }
      )

      return run.deps.evolu.upsert(
        "fioPlugin",
        removeUndefinedValues({
          ...input,
          id,
          syncLookbackDays,
        }),
        { ...options, ownerId: evoluOwnerId }
      )
    })

    return ok(id)
  }

export const updateFioPlugin =
  ({
    token,
    ...input
  }: Pick<
    UpdateValues<typeof fioPlugin>,
    | "id"
    | "accountId"
    | "numberOfSecondsBetweenChecks"
    | "syncLookbackDays"
    | "isActive"
  > & {
    readonly token?: InsertValues<typeof fioPluginToken>["token"]
  }): Task<FioPluginId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    const tokenId = createTableId<"FioPluginToken">()

    await runMutationWithCompletion((options) => {
      if (token !== undefined) {
        run.deps.evolu.upsert(
          "fioPluginToken",
          removeUndefinedValues({
            id: tokenId,
            fioPluginId: input.id,
            token,
          }),
          { ...options, ownerId: evoluOwnerId }
        )
      }

      return run.deps.evolu.update("fioPlugin", removeUndefinedValues(input), {
        ...options,
        ownerId: evoluOwnerId,
      })
    })

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
