import { ok, sqliteFalse, sqliteTrue, type Task } from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/utils.ts"
import type { CountryCode } from "./legal-entity-types.ts"
import {
  createDefaultLegalEntity,
  legalEntityId,
} from "./legal-entity-utils.ts"

/**
 * Upserts the singleton `legalEntity` row. Used by both the onboarding
 * country step and the legal-entity settings page — always writes both
 * fields together so neither can be left stale.
 */
export const setLegalEntity =
  (input: {
    readonly country: CountryCode | null
    readonly vatPayer: boolean | null
  }): Task<typeof legalEntityId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.upsert(
        "legalEntity",
        {
          ...createDefaultLegalEntity(),
          country: input.country,
          vatPayer:
            input.vatPayer === null
              ? null
              : input.vatPayer
                ? sqliteTrue
                : sqliteFalse,
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )
    return ok(legalEntityId)
  }
