import { ok, sqliteFalse, sqliteTrue, type Task } from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/utils.ts"

export const setDefaultPaymentAccount =
  ({
    accountId,
    enabled,
  }: {
    readonly accountId: AccountId
    readonly enabled: boolean
  }): Task<AccountId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.upsert(
        "defaultPaymentAccount",
        {
          id: accountId,
          isDeleted: enabled ? sqliteFalse : sqliteTrue,
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(accountId)
  }
