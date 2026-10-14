import { sqliteTrue } from "@evolu/common"

import type { CashuShardStore } from "@/core/cashu/cashu-shard-store.ts"
import { cashuDeviceKnownMintsQuery } from "@/core/evolu/device-cashu.ts"
import type {
  DeviceAccountId,
  DeviceEvolu,
} from "@/core/evolu/device-client.ts"
import type { MintUrl } from "@/core/modules/cashu/cashu-types.ts"
import { normalizeMintUrl } from "@/core/modules/cashu/cashu-utils.ts"

/**
 * Linky's `knownMints`: the mints stored proofs name (any state), the mints
 * stored operations name (`mint` and `sourceMint`), and the mints this device
 * has seen or added. Being known says nothing about trust (cashu.md §5).
 */
export const loadKnownCashuMints = async ({
  store,
  deviceEvolu,
  deviceAccountId,
}: {
  readonly store: CashuShardStore
  readonly deviceEvolu: DeviceEvolu
  readonly deviceAccountId: DeviceAccountId
}): Promise<ReadonlyArray<MintUrl>> => {
  const [proofs, operations, deviceRows] = await Promise.all([
    store.loadProofs(),
    store.loadOperations(),
    deviceEvolu.loadQuery(cashuDeviceKnownMintsQuery(deviceAccountId)),
  ])
  const device = deviceRows.flatMap((row) => {
    if (row.seen !== sqliteTrue && row.added !== sqliteTrue) return []
    const mint = row.mint === null ? null : normalizeMintUrl(row.mint)
    return mint === null ? [] : [mint]
  })
  return [
    ...new Set([
      ...proofs.map((proof) => proof.mint),
      ...operations.flatMap((operation) =>
        operation.sourceMint === null
          ? [operation.mint]
          : [operation.mint, operation.sourceMint]
      ),
      ...device,
    ]),
  ].toSorted()
}
