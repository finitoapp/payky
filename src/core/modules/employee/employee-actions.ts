import {
  type MutationOptions,
  ok,
  sqliteFalse,
  sqliteTrue,
  type Task,
} from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/evolu-utils.ts"
import type { NonEmptyString255 } from "@/core/modules/shared/schema.ts"
import { activeEmployeesQuery } from "./employee-queries.ts"
import type { EmployeeId } from "./employee-types.ts"

export const createEmployee =
  ({
    name,
  }: {
    readonly name: NonEmptyString255
  }): Task<EmployeeId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { id } = await runMutationWithCompletion((options) =>
      run.deps.evolu.insert(
        "employee",
        { name },
        { ...options, ownerId: run.deps.evoluOwnerId }
      )
    )
    return ok(id)
  }

export const renameEmployee =
  ({
    id,
    name,
  }: {
    readonly id: EmployeeId
    readonly name: NonEmptyString255
  }): Task<EmployeeId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "employee",
        { id, name },
        { ...options, ownerId: run.deps.evoluOwnerId }
      )
    )
    return ok(id)
  }

/** Payments already tagged with the employee keep the tag and its name. */
export const deleteEmployee =
  (id: EmployeeId): Task<EmployeeId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "employee",
        { id, isDeleted: sqliteTrue },
        { ...options, ownerId: run.deps.evoluOwnerId }
      )
    )
    return ok(id)
  }

export interface MirroredEmployee {
  readonly id: EmployeeId
  readonly name: NonEmptyString255
}

/**
 * Loads the live employee ids, for {@link upsertMirroredEmployeeRows} to
 * retire the ones the owner's list no longer has.
 */
export const loadEmployeeIds =
  (): Task<ReadonlyArray<EmployeeId>, never, EvoluDep> => async (run) =>
    ok(
      (await run.deps.evolu.loadQuery(activeEmployeesQuery)).map(
        (row) => row.id
      )
    )

/**
 * Makes a station's employees the owner's list: upserts each under the
 * owner's id and soft-deletes every other one of `currentIds`. Joins the
 * caller's mutation batch.
 */
export const upsertMirroredEmployeeRows = (
  evolu: EvoluDep["evolu"],
  {
    employees,
    currentIds,
  }: {
    readonly employees: ReadonlyArray<MirroredEmployee>
    readonly currentIds: ReadonlyArray<EmployeeId>
  },
  options: MutationOptions
): void => {
  const keptIds = new Set(employees.map((employee) => employee.id))
  for (const id of currentIds) {
    if (!keptIds.has(id)) {
      evolu.update("employee", { id, isDeleted: sqliteTrue }, options)
    }
  }
  for (const employee of employees) {
    evolu.upsert("employee", { ...employee, isDeleted: sqliteFalse }, options)
  }
}
