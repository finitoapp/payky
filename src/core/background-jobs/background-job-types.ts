import type { Evolu } from "@/core/evolu/schema.ts"

export interface BackgroundJobContext {
  readonly evolu: Evolu
  readonly onError: (error: unknown) => void
}

export type BackgroundJob = (context: BackgroundJobContext) => Disposable
