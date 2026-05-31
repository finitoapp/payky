import type { ConsoleDep, Task } from "@evolu/common"
import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"

export interface BackgroundJobOnErrorDep {
  readonly onError: (error: unknown) => void
}

export type BackgroundJobContext = EvoluDep &
  EvoluOwnerIdDep &
  ConsoleDep &
  BackgroundJobOnErrorDep

export type BackgroundJob = Task<Disposable, never, BackgroundJobContext>
