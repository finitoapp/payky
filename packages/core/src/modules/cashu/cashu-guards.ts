import { ok, type Task } from "@evolu/common"
import type { EvoluDep } from "../shared/evolu-deps.ts"
import {
  type CashuMeltRow,
  type CashuOperationSnapshot,
  type CashuReceiveRow,
  type CashuTopupRow,
  cashuClaimAttemptQuery,
  cashuMeltQuery,
  cashuOperationQuery,
  cashuReceiveQuery,
  cashuTopupQuery,
} from "./cashu-queries.ts"
import type { CashuOperationId } from "./cashu-types.ts"

/**
 * The read side of the Cashu actions: an operation's current state and
 * whose attempt it carries (cashu/0015). These read and return `Result`;
 * they never write.
 */

const loadFirst =
  <Row>(
    load: (deps: EvoluDep) => Promise<ReadonlyArray<Row>>
  ): Task<Row | null, never, EvoluDep> =>
  async (run) => {
    const [row] = await load(run.deps)
    return ok(row ?? null)
  }

export const loadCashuOperation = (
  id: CashuOperationId
): Task<CashuOperationSnapshot | null, never, EvoluDep> =>
  loadFirst((deps) => deps.evolu.loadQuery(cashuOperationQuery(id)))

export const loadCashuTopup = (
  id: CashuOperationId
): Task<CashuTopupRow | null, never, EvoluDep> =>
  loadFirst((deps) => deps.evolu.loadQuery(cashuTopupQuery(id)))

export const loadCashuReceive = (
  id: CashuOperationId
): Task<CashuReceiveRow | null, never, EvoluDep> =>
  loadFirst((deps) => deps.evolu.loadQuery(cashuReceiveQuery(id)))

export const loadCashuMelt = (
  id: CashuOperationId
): Task<CashuMeltRow | null, never, EvoluDep> =>
  loadFirst((deps) => deps.evolu.loadQuery(cashuMeltQuery(id)))

/** The counter this device reserved for the operation, or null for none. */
export const loadOwnCashuAttempt =
  (operationId: CashuOperationId): Task<number | null, never, EvoluDep> =>
  async (run) => {
    const [row] = await run.deps.evolu.loadQuery(
      cashuClaimAttemptQuery(operationId)
    )
    return ok(row?.counter ?? null)
  }

/**
 * Another Payky device is working on it: the operation carries a counter
 * this device never reserved (cashu/0015).
 */
export const isClaimedElsewhere = (
  operation: { readonly counter: number | null },
  ownCounter: number | null
): boolean => operation.counter !== null && operation.counter !== ownCounter
