import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { EvoluOwnerDep, FetchDep } from "../../deps.ts"
import type { QerkoApiDep } from "../../integrations/qerko/qerko-client.ts"
import { createQerkoApiDep } from "../../integrations/qerko/qerko-client.ts"
import { createEvoluTest } from "../../testing/evolu.ts"
import { evoluTestDeps } from "../../testing/evolu-deps.ts"
import type { EvoluDep } from "../shared/evolu-deps.ts"
import {
  completeQerkoPairing,
  deleteQerkoPlugin,
} from "./qerko-plugin-actions.ts"
import { qerkoPluginQuery } from "./qerko-plugin-queries.ts"

const terminals = {
  legalEntity: {
    id: "le",
    name: "Cafe s.r.o.",
    identificationNumber: "12345678",
    country: "CZ",
  },
  locations: [],
}

const pairing = {
  environment: "sandbox",
  pairingRequestId: "p-1",
  code: "1234",
  name: "Payky",
} as const

const fakeFetch =
  (confirmReply: unknown): FetchDep["fetch"] =>
  async (input) =>
    Response.json(
      String(input).endsWith("/confirm-pairing") ? confirmReply : terminals
    )

describe("completeQerkoPairing", () => {
  test("saves the key with its environment and the legal entity", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      ...evoluTestDeps(evolu),
      ...createQerkoApiDep({ posId: "pos" }),
      fetch: fakeFetch({
        type: "ok",
        apiKey: { token: "secret", name: "Payky" },
      }),
    } satisfies EvoluDep & EvoluOwnerDep & QerkoApiDep & FetchDep
    await using run = testCreateRun(deps)

    await expect(run(completeQerkoPairing(pairing))).resolves.toEqual({
      ok: true,
      value: undefined,
    })

    await expect
      .poll(() => evolu.loadQuery(qerkoPluginQuery))
      .toMatchObject([
        {
          environment: "sandbox",
          apiKey: "secret",
          apiKeyName: "Payky",
          legalEntityName: "Cafe s.r.o.",
          identificationNumber: "12345678",
          country: "CZ",
        },
      ])
  })

  test.each([
    [
      { type: "invalidCode", remainingAttempts: 2 },
      { type: "QerkoPairingInvalidCode", remainingAttempts: 2 },
    ],
    [{ type: "codeExpired" }, { type: "QerkoPairingCodeExpired" }],
    [
      { type: "maxAttemptsReached" },
      { type: "QerkoPairingMaxAttemptsReached" },
    ],
  ])("reports %j and saves nothing", async (reply, error) => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      ...evoluTestDeps(evolu),
      ...createQerkoApiDep({ posId: "pos" }),
      fetch: fakeFetch(reply),
    } satisfies EvoluDep & EvoluOwnerDep & QerkoApiDep & FetchDep
    await using run = testCreateRun(deps)

    await expect(run(completeQerkoPairing(pairing))).resolves.toMatchObject({
      ok: false,
      error,
    })
    await expect(evolu.loadQuery(qerkoPluginQuery)).resolves.toEqual([])
  })

  test("unpairing removes the pairing", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      ...evoluTestDeps(evolu),
      ...createQerkoApiDep({ posId: "pos" }),
      fetch: fakeFetch({
        type: "ok",
        apiKey: { token: "secret", name: "Payky" },
      }),
    } satisfies EvoluDep & EvoluOwnerDep & QerkoApiDep & FetchDep
    await using run = testCreateRun(deps)
    expect((await run(completeQerkoPairing(pairing))).ok).toBe(true)
    await expect.poll(() => evolu.loadQuery(qerkoPluginQuery)).toHaveLength(1)

    await run.ok(deleteQerkoPlugin())

    await expect.poll(() => evolu.loadQuery(qerkoPluginQuery)).toHaveLength(0)
  })
})
