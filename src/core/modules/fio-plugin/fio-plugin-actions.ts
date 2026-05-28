import {
  type InsertValues,
  ok,
  sqliteTrue,
  type Task,
  type UpdateValues,
} from "@evolu/common"

import { defineError } from "@/core/error.ts"
import type {
  FioPluginRow,
  fioPlugin,
  fioPluginToken,
} from "@/core/modules/fio-plugin/fio-plugin.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { getFirstOr } from "@/core/modules/shared/result.ts"
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
    ...input
  }: InsertValues<typeof fioPlugin> & {
    readonly token: InsertValues<typeof fioPluginToken>["token"]
  }): Task<FioPluginId, never, EvoluDep> =>
  async (run) => {
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
        options
      )

      return run.deps.evolu.upsert(
        "fioPlugin",
        removeUndefinedValues({
          ...input,
          id,
        }),
        options
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
    "id" | "accountId" | "apiUrl" | "numberOfSecondsBetweenChecks" | "isActive"
  > & {
    readonly token?: InsertValues<typeof fioPluginToken>["token"]
  }): Task<FioPluginId, never, EvoluDep> =>
  async (run) => {
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
          options
        )
      }

      return run.deps.evolu.update(
        "fioPlugin",
        removeUndefinedValues(input),
        options
      )
    })

    return ok(input.id)
  }

export const deleteFioPlugin =
  (idValue: FioPluginId): Task<FioPluginId, never, EvoluDep> =>
  async (run) => {
    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "fioPlugin",
        {
          id: idValue,
          isDeleted: sqliteTrue,
        },
        options
      )
    )

    return ok(idValue)
  }
