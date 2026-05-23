import type { ConsoleDep, Task } from "@evolu/common"
import type { DateDep, EvoluOwnerIdDep, FetchDep } from "@/core/deps.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"

export interface BackgroundJobOnErrorDep {
  readonly onError: (error: unknown) => void
}

export type BackgroundJobContext = EvoluDep &
  EvoluOwnerIdDep &
  ConsoleDep &
  DateDep &
  FetchDep &
  BackgroundJobOnErrorDep

export type BackgroundJob = Task<AsyncDisposable, never, BackgroundJobContext>
