import {
  type InferRow,
  type KyselyNotNull,
  ok,
  sqliteFalse,
  sqliteTrue,
} from "@evolu/common"

import {
  deriveDeviceAccountId,
  upsertAccountEvoluWebsocketTransport,
} from "@/core/evolu/device-account.ts"
import {
  type AccountId,
  createDeviceQuery,
} from "@/core/evolu/device-client.ts"
import type { DeviceMigration } from "@/core/migrations/migrations.ts"
import type { DeviceEvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/evolu-utils.ts"
import type { MasterKey } from "@/core/modules/shared/key-derivation.ts"
import type { NonEmptyString255 } from "@/core/modules/shared/schema.ts"

/**
 * Every device account, removed ones included, oldest first — the order the
 * derived rows are written in, so the account list keeps its order even
 * though each derived row's `createdAt` becomes the time of this migration.
 */
const accountRowsQuery = createDeviceQuery((db) =>
  db
    .selectFrom("account")
    .select(["id", "name", "masterKey", "lastUseAt", "isDeleted"])
    .where("masterKey", "is not", null)
    .where("name", "is not", null)
    .where("lastUseAt", "is not", null)
    .orderBy("createdAt")
    .orderBy("id")
    .$narrowType<{
      name: KyselyNotNull
      masterKey: KyselyNotNull
      lastUseAt: KyselyNotNull
    }>()
)

type AccountRow = InferRow<typeof accountRowsQuery>

const transportRowsQuery = createDeviceQuery((db) =>
  db
    .selectFrom("accountEvoluTransport")
    .innerJoin(
      "accountEvoluTransportWebsocket",
      "accountEvoluTransportWebsocket.id",
      "accountEvoluTransport.id"
    )
    .select([
      "accountEvoluTransport.accountId",
      "accountEvoluTransport.isActive",
      "accountEvoluTransportWebsocket.url",
    ])
    .where("accountEvoluTransport.isDeleted", "is not", sqliteTrue)
    .where("accountEvoluTransportWebsocket.isDeleted", "is not", sqliteTrue)
    .where("accountEvoluTransport.accountId", "is not", null)
    .where("accountEvoluTransport.isActive", "is not", null)
    .where("accountEvoluTransportWebsocket.url", "is not", null)
    .$narrowType<{
      accountId: KyselyNotNull
      isActive: KyselyNotNull
      url: KyselyNotNull
    }>()
)

/** One account's move onto its derived id. */
interface AccountMove {
  readonly id: AccountId
  readonly name: NonEmptyString255
  readonly masterKey: MasterKey
  readonly lastUseAt: AccountRow["lastUseAt"]
  /** Removed when every row of the account was. */
  readonly isDeleted: boolean
  /** The row whose name and transports the derived row takes over. */
  readonly sourceId: AccountId
  /** Live rows under other ids, removed once the derived row exists. */
  readonly retiredIds: ReadonlyArray<AccountId>
}

const newestFirst = (rows: ReadonlyArray<AccountRow>) =>
  [...rows].sort((a, b) => b.lastUseAt - a.lastUseAt)

/**
 * What is left to do, read by both `hasWork` and `run`. Per master key: the
 * live rows (or, for a removed account, every row) decide the name, taken
 * from the most recently used one, and the derived row inherits their latest
 * `lastUseAt`, so whichever account was active stays active. An account is
 * done once its derived row exists and no other row of it is live.
 */
const planAccountMoves = (
  rows: ReadonlyArray<AccountRow>
): ReadonlyArray<AccountMove> => {
  const groups = new Map<MasterKey, AccountRow[]>()
  for (const row of rows) {
    groups.set(row.masterKey, [...(groups.get(row.masterKey) ?? []), row])
  }

  return [...groups].flatMap(([masterKey, group]) => {
    const id = deriveDeviceAccountId(masterKey)
    const live = group.filter((row) => row.isDeleted !== sqliteTrue)
    const retiredIds = live.filter((row) => row.id !== id).map((row) => row.id)
    const hasDerivedRow = group.some((row) => row.id === id)
    if (hasDerivedRow && retiredIds.length === 0) return []

    const [source] = newestFirst(live.length > 0 ? live : group)
    if (source === undefined) return []
    return [
      {
        id,
        name: source.name,
        masterKey,
        lastUseAt: source.lastUseAt,
        isDeleted: live.length === 0,
        sourceId: source.id,
        retiredIds,
      },
    ]
  })
}

const loadAccountMoves = async ({ deviceEvolu }: DeviceEvoluDep) =>
  planAccountMoves(await deviceEvolu.loadQuery(accountRowsQuery))

/**
 * Moves every device account onto `deriveDeviceAccountId`, so adding an
 * account needs to look up only its derived id (account/0003). Each account
 * keeps its name, transports and last use; the rows it had under random ids
 * are removed, duplicates of one account collapse into one, and a removed
 * account moves as a removed row, so re-adding it revives its name.
 */
export const deviceAccountDerivedIdMigration: DeviceMigration = {
  name: "2026-10-08-device-account-derived-id",
  hasWork: async (run) => ok((await loadAccountMoves(run.deps)).length > 0),
  run: async (run) => {
    const { deviceEvolu } = run.deps
    const moves = await loadAccountMoves(run.deps)
    const transports = await deviceEvolu.loadQuery(transportRowsQuery)

    await runMutationWithCompletion((options) => {
      for (const move of moves) {
        deviceEvolu.upsert(
          "account",
          {
            id: move.id,
            name: move.name,
            masterKey: move.masterKey,
            lastUseAt: move.lastUseAt,
            isDeleted: move.isDeleted ? sqliteTrue : sqliteFalse,
          },
          options
        )
        if (move.sourceId !== move.id) {
          for (const transport of transports) {
            if (transport.accountId !== move.sourceId) continue
            upsertAccountEvoluWebsocketTransport(
              deviceEvolu,
              {
                accountId: move.id,
                isActive: transport.isActive,
                url: transport.url,
              },
              options
            )
          }
        }
        for (const retiredId of move.retiredIds) {
          deviceEvolu.update(
            "account",
            { id: retiredId, isDeleted: sqliteTrue },
            options
          )
        }
      }
    })

    return ok(moves.length)
  },
}
