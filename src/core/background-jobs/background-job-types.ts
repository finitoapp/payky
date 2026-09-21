import type { ConsoleDep, LockManagerDep, Task } from "@evolu/common"
import type { CashuWalletDep } from "@/core/cashu/cashu-wallet.ts"
import type { DateDep, EvoluOwnerIdDep, FetchDep } from "@/core/deps.ts"
import type { NostrInboxDep } from "@/core/linky/nostr-inbox-source.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"

export interface BackgroundJobOnErrorDep {
  readonly onError: (error: unknown) => void
}

export type BackgroundJobContext = EvoluDep &
  EvoluOwnerIdDep &
  ConsoleDep &
  DateDep &
  FetchDep &
  LockManagerDep &
  CashuWalletDep &
  NostrInboxDep &
  BackgroundJobOnErrorDep

export type BackgroundJob = Task<AsyncDisposable, never, BackgroundJobContext>
