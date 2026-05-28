import {
  evoluJsonArrayFrom,
  sqliteFalse,
  sqliteTrue,
  testCreateRun,
} from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createQuery } from "@/core/evolu/schema.ts"
import { createAccount } from "@/core/modules/account/account-actions.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { createEvoluTest } from "../../evolu/cli-client"
import {
  createFioPlugin,
  deleteFioPlugin,
  loadFioPlugin,
  updateFioPlugin,
} from "./fio-plugin-actions.ts"
import type { FioPluginId } from "./fio-plugin-types.ts"

const fioPluginWithTokensByIdQuery = (id: FioPluginId) =>
  createQuery((db) =>
    db
      .selectFrom("fioPlugin")
      .select((eb) => [
        "fioPlugin.id",
        "fioPlugin.accountId",
        "fioPlugin.apiUrl",
        "fioPlugin.numberOfSecondsBetweenChecks",
        "fioPlugin.isActive",
        "fioPlugin.isDeleted",
        evoluJsonArrayFrom(
          eb
            .selectFrom("fioPluginToken")
            .select([
              "fioPluginToken.id",
              "fioPluginToken.fioPluginId",
              "fioPluginToken.token",
              "fioPluginToken.isDeleted",
            ])
            .whereRef("fioPluginToken.fioPluginId", "=", "fioPlugin.id")
            .orderBy("fioPluginToken.createdAt")
        ).as("tokens"),
      ])
      .where("fioPlugin.id", "=", id)
  )

const createIbanAccount = async (deps: EvoluDep): Promise<AccountId> => {
  await using run = testCreateRun(deps)
  return await run.orThrow(
    createAccount({
      deviceId: null,
      name: "Bank account",
      iban: {
        iban: "CZ6508000000192000145399",
        currency: "CZK",
      },
    })
  )
}

describe("fio plugin actions", () => {
  test("creates and loads a FIO plugin with token through real Evolu", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)
    const accountId = await createIbanAccount(deps)

    const idResult = await run(
      createFioPlugin({
        accountId,
        apiUrl: "https://fioapi.fio.cz",
        numberOfSecondsBetweenChecks: 300,
        isActive: sqliteTrue,
        token: "fio-token-1",
      })
    )

    expect(idResult.ok).toBe(true)
    if (!idResult.ok) return

    const id = idResult.value
    await expect
      .poll(() => evolu.loadQuery(fioPluginWithTokensByIdQuery(id)))
      .toMatchObject([
        {
          id,
          accountId,
          apiUrl: "https://fioapi.fio.cz",
          numberOfSecondsBetweenChecks: 300,
          isActive: sqliteTrue,
          tokens: [
            {
              fioPluginId: id,
              token: "fio-token-1",
              isDeleted: null,
            },
          ],
        },
      ])

    await expect(run(loadFioPlugin(id))).resolves.toMatchObject({
      ok: true,
      value: {
        id,
        accountId,
      },
    })
  }, 15_000)

  test("updates FIO plugin config and adds a token without preloading existing rows", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)
    const accountId = await createIbanAccount(deps)

    const idResult = await run(
      createFioPlugin({
        accountId,
        apiUrl: "https://fioapi.fio.cz",
        numberOfSecondsBetweenChecks: 300,
        isActive: sqliteTrue,
        token: "fio-token-1",
      })
    )
    expect(idResult.ok).toBe(true)
    if (!idResult.ok) return

    const id = idResult.value
    const updateResult = await run(
      updateFioPlugin({
        id,
        apiUrl: "https://fioapi.fio.cz/v1",
        numberOfSecondsBetweenChecks: 600,
        isActive: sqliteFalse,
        token: "fio-token-2",
      })
    )

    expect(updateResult).toEqual({
      ok: true,
      value: id,
    })
    await expect
      .poll(() => evolu.loadQuery(fioPluginWithTokensByIdQuery(id)))
      .toMatchObject([
        {
          id,
          apiUrl: "https://fioapi.fio.cz/v1",
          numberOfSecondsBetweenChecks: 600,
          isActive: sqliteFalse,
          tokens: [
            {
              fioPluginId: id,
              token: "fio-token-1",
              isDeleted: null,
            },
            {
              fioPluginId: id,
              token: "fio-token-2",
              isDeleted: null,
            },
          ],
        },
      ])
  }, 15_000)

  test("creates a FIO plugin without validating account existence or kind", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)
    const cashRegisterAccountId = await run.orThrow(
      createAccount({
        deviceId: null,
        name: "Cash register",
        cashRegister: {
          currency: "CZK",
        },
      })
    )

    const idResult = await run(
      createFioPlugin({
        accountId: cashRegisterAccountId,
        apiUrl: "https://fioapi.fio.cz",
        numberOfSecondsBetweenChecks: 300,
        isActive: sqliteTrue,
        token: "fio-token-1",
      })
    )

    expect(idResult.ok).toBe(true)
    if (!idResult.ok) return

    await expect
      .poll(() => evolu.loadQuery(fioPluginWithTokensByIdQuery(idResult.value)))
      .toMatchObject([
        {
          id: idResult.value,
          accountId: cashRegisterAccountId,
          tokens: [
            {
              fioPluginId: idResult.value,
              token: "fio-token-1",
            },
          ],
        },
      ])
    await expect(
      run(
        updateFioPlugin({
          id: idResult.value,
          accountId: cashRegisterAccountId,
        })
      )
    ).resolves.toEqual({
      ok: true,
      value: idResult.value,
    })
  }, 15_000)

  test("soft deletes only the plugin root row", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)
    const accountId = await createIbanAccount(deps)

    const idResult = await run(
      createFioPlugin({
        accountId,
        apiUrl: "https://fioapi.fio.cz",
        numberOfSecondsBetweenChecks: 300,
        isActive: sqliteTrue,
        token: "fio-token-1",
      })
    )
    expect(idResult.ok).toBe(true)
    if (!idResult.ok) return

    const id = idResult.value
    await expect(run(deleteFioPlugin(id))).resolves.toEqual({
      ok: true,
      value: id,
    })
    await expect(run(deleteFioPlugin(id))).resolves.toEqual({
      ok: true,
      value: id,
    })

    await expect
      .poll(() => evolu.loadQuery(fioPluginWithTokensByIdQuery(id)))
      .toMatchObject([
        {
          id,
          isDeleted: sqliteTrue,
          tokens: [
            {
              fioPluginId: id,
              token: "fio-token-1",
              isDeleted: null,
            },
          ],
        },
      ])
    await expect(run(loadFioPlugin(id))).resolves.toMatchObject({
      ok: false,
      error: {
        type: "FioPluginNotFound",
        id,
      },
    })
    await expect(
      run(
        updateFioPlugin({
          id,
          numberOfSecondsBetweenChecks: 900,
        })
      )
    ).resolves.toEqual({
      ok: true,
      value: id,
    })
  }, 15_000)
})
