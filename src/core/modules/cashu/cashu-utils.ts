import { createIdFromString, type OwnerId } from "@evolu/common"

import type {
  CashuOperationId,
  CashuOperationKind,
  CashuProofId,
  CashuProofState,
  LinkySettingId,
  MintUrl,
  ShardPointerId,
} from "@/core/modules/cashu/cashu-types.ts"
import { MintUrlSchema } from "@/core/modules/cashu/cashu-types.ts"

/**
 * Linky's `normalizeMintUrl` (`apps/web-app/src/utils/mint.ts`) followed by
 * linkshu's `parseMintUrl`: trimmed, no trailing slash, no search or hash,
 * and any `mint.minibits.cash` URL forced to `/Bitcoin`. Null when the result
 * is not an http(s) URL with a host. Pinned by `cashu-cross-app.test.ts`.
 */
export const normalizeMintUrl = (value: string): MintUrl | null => {
  const raw = value.trim()
  if (raw === "") return null
  const stripped = raw.replace(/\/+$/u, "")

  const normalized = (() => {
    try {
      const url = new URL(stripped)
      if (url.host.toLowerCase() === "mint.minibits.cash")
        return "https://mint.minibits.cash/Bitcoin"
      const pathname = url.pathname.replace(/\/+$/u, "")
      return `${url.origin}${pathname}`.replace(/\/+$/u, "")
    } catch {
      return stripped
    }
  })()

  // linkshu's `parseMintUrl` trims and strips trailing slashes once more.
  const parsed = MintUrlSchema.safeParse(normalized.trim().replace(/\/+$/u, ""))
  return parsed.success ? parsed.data : null
}

/**
 * linkshu's `operationKeyOf` (`src/ports/OperationStore.ts`): a quote
 * operation by kind, mint and quote id, any other by kind and token text.
 */
export const operationKeyOf = (operation: {
  readonly kind: CashuOperationKind
  readonly mint: string
  readonly quoteId: string | null
  readonly tokenText: string | null
}): string =>
  operation.quoteId === null && operation.tokenText !== null
    ? [operation.kind, operation.tokenText].join("|")
    : [operation.kind, operation.mint, operation.quoteId ?? ""].join("|")

/** The proof id hashes the secret, so a synced or restored proof never duplicates. */
export const cashuProofIdFor = (secret: string): CashuProofId =>
  createIdFromString<"CashuProof">(secret)

/** The operation id hashes {@link operationKeyOf}. */
export const cashuOperationIdFor = (operationKey: string): CashuOperationId =>
  createIdFromString<"CashuOperation">(operationKey)

/** Every device upserts the same pointer row per scope. */
export const shardPointerIdFor = (scope: string): ShardPointerId =>
  createIdFromString<"ShardPointer">(`shardPointer/${scope}`)

export const linkySettingIdFor = (key: string): LinkySettingId =>
  createIdFromString<"Setting">(`setting/${key}`)

/** What every merge needs of a row: who holds the copy and whether it is a tombstone. */
export interface ShardRowCopy {
  readonly id: string
  readonly ownerId: OwnerId
  readonly isDeleted: 0 | 1 | null
}

/**
 * Linky's plain merge (`mergeShardRows`): one copy per id, the highest
 * shard's, from owners in `indexByOwner` only; tombstones dropped.
 */
export const mergeShardRows = <Row extends ShardRowCopy>(
  rows: ReadonlyArray<Row>,
  indexByOwner: ReadonlyMap<OwnerId, number>
): ReadonlyArray<Row> => {
  const newest = new Map<
    string,
    { readonly row: Row; readonly index: number }
  >()
  for (const row of rows) {
    const index = indexByOwner.get(row.ownerId)
    if (index === undefined) continue
    const current = newest.get(row.id)
    if (current === undefined || index > current.index)
      newest.set(row.id, { row, index })
  }
  return [...newest.values()]
    .map((entry) => entry.row)
    .filter((row) => row.isDeleted !== 1)
}

/**
 * Linky's `mergeProofCopies` (`repositories/wallet.ts`): per id the highest
 * shard's copy wins, except that any `spent` copy wins, and a spent proof is
 * kept even when its copy is a tombstone.
 */
export const mergeProofCopies = <
  Row extends ShardRowCopy & { readonly state: CashuProofState | null },
>(
  rows: ReadonlyArray<Row>,
  indexByOwner: ReadonlyMap<OwnerId, number>
): ReadonlyArray<Row> => {
  const newestFirst = rows
    .filter((row) => indexByOwner.has(row.ownerId))
    .toSorted(
      (a, b) =>
        (indexByOwner.get(b.ownerId) ?? 0) - (indexByOwner.get(a.ownerId) ?? 0)
    )
  const byId = new Map<string, Row>()
  for (const copy of newestFirst) {
    const current = byId.get(copy.id)
    if (
      current === undefined ||
      (copy.state === "spent" && current.state !== "spent")
    )
      byId.set(copy.id, copy)
  }
  return [...byId.values()].filter(
    (row) => row.state === "spent" || row.isDeleted !== 1
  )
}
