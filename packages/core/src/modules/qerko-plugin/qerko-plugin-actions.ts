import {
  err,
  type InsertValues,
  ok,
  sqliteFalse,
  sqliteTrue,
  type Task,
} from "@evolu/common"

import type { EvoluOwnerDep, FetchDep } from "../../deps.ts"
import { defineError } from "../../error.ts"
import {
  confirmQerkoPairing,
  getQerkoTerminals,
  type QerkoApiDep,
  type QerkoClientError,
  type QerkoCredentials,
  type QerkoEnvironment,
} from "../../integrations/qerko/qerko-client.ts"
import type { EvoluDep } from "../shared/evolu-deps.ts"
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import { NonEmptyString255, NonEmptyStringSchema } from "../shared/schema.ts"
import type { qerkoPlugin } from "./qerko-plugin.ts"
import { qerkoPluginQuery } from "./qerko-plugin-queries.ts"
import { qerkoPluginId } from "./qerko-plugin-utils.ts"

export const createQerkoPairingInvalidCodeError = defineError(
  "QerkoPairingInvalidCode"
)<{ readonly remainingAttempts: number }>()
export type QerkoPairingInvalidCodeError = ReturnType<
  typeof createQerkoPairingInvalidCodeError
>

export const createQerkoPairingCodeExpiredError = defineError(
  "QerkoPairingCodeExpired"
)()
export type QerkoPairingCodeExpiredError = ReturnType<
  typeof createQerkoPairingCodeExpiredError
>

export const createQerkoPairingMaxAttemptsReachedError = defineError(
  "QerkoPairingMaxAttemptsReached"
)()
export type QerkoPairingMaxAttemptsReachedError = ReturnType<
  typeof createQerkoPairingMaxAttemptsReachedError
>

/** There is no Qerko pairing, so no API key to call the terminal with. */
export const createQerkoPluginNotPairedError = defineError(
  "QerkoPluginNotPaired"
)()
export type QerkoPluginNotPairedError = ReturnType<
  typeof createQerkoPluginNotPairedError
>

/** The API key and environment of the pairing, for every terminal call. */
export const loadQerkoCredentials =
  (): Task<QerkoCredentials, QerkoPluginNotPairedError, EvoluDep> =>
  async (run) => {
    const [plugin] = await run.deps.evolu.loadQuery(qerkoPluginQuery)
    if (plugin === undefined) return err(createQerkoPluginNotPairedError())
    return ok({ apiKey: plugin.apiKey, environment: plugin.environment })
  }

/** Upserts the singleton `qerkoPlugin` row: the one write behind pairing. */
export const saveQerkoPlugin =
  (
    input: Omit<InsertValues<typeof qerkoPlugin>, "id">
  ): Task<void, never, EvoluDep & EvoluOwnerDep> =>
  async (run) => {
    const { evoluOwner } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.upsert(
        "qerkoPlugin",
        { ...input, id: qerkoPluginId, isDeleted: sqliteFalse },
        { ...options, owner: evoluOwner }
      )
    )

    return ok()
  }

/** Unpairs: soft-deletes the plugin row, which drops the API key with it. */
export const deleteQerkoPlugin =
  (): Task<void, never, EvoluDep & EvoluOwnerDep> => async (run) => {
    const { evoluOwner } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "qerkoPlugin",
        { id: qerkoPluginId, isDeleted: sqliteTrue },
        { ...options, owner: evoluOwner }
      )
    )

    return ok()
  }

/**
 * Exchanges the e-mailed code for the API key and saves the pairing. The
 * legal entity's name comes from `get-terminals`, called with the new key:
 * that call is also the first proof the key works. The pairing is requested
 * with `requestQerkoPairing` from the client, which needs nothing of ours.
 */
export const completeQerkoPairing =
  ({
    environment,
    pairingRequestId,
    code,
    name,
  }: {
    readonly environment: QerkoEnvironment
    readonly pairingRequestId: string
    readonly code: string
    /** What the key is called in Qerko's list of keys. */
    readonly name: string
  }): Task<
    void,
    | QerkoPairingInvalidCodeError
    | QerkoPairingCodeExpiredError
    | QerkoPairingMaxAttemptsReachedError
    | QerkoClientError,
    QerkoApiDep & FetchDep & EvoluDep & EvoluOwnerDep
  > =>
  async (run) => {
    const confirmed = await run(
      confirmQerkoPairing({ environment, pairingRequestId, code, name })
    )
    if (!confirmed.ok) return confirmed
    const result = confirmed.value

    if (result.type === "invalidCode") {
      return err(
        createQerkoPairingInvalidCodeError({
          remainingAttempts: result.remainingAttempts,
        })
      )
    }
    if (result.type === "codeExpired") {
      return err(createQerkoPairingCodeExpiredError())
    }
    if (result.type === "maxAttemptsReached") {
      return err(createQerkoPairingMaxAttemptsReachedError())
    }

    const credentials = { apiKey: result.apiKey.token, environment }
    const terminals = await run(getQerkoTerminals(credentials))
    if (!terminals.ok) return terminals
    const { legalEntity } = terminals.value

    await run.ok(
      saveQerkoPlugin({
        environment,
        apiKey: NonEmptyStringSchema.decode(result.apiKey.token),
        apiKeyName: NonEmptyString255(result.apiKey.name),
        legalEntityName: NonEmptyString255(legalEntity.name),
        identificationNumber: NonEmptyString255(
          legalEntity.identificationNumber
        ),
        country: legalEntity.country,
      })
    )

    return ok()
  }
