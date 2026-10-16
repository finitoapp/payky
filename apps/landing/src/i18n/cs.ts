import { csCommon } from "./cs/common.ts"
import { csLanding } from "./cs/landing.ts"
import type { TranslationKey } from "./en.ts"
export const cs = { ...csCommon, ...csLanding } as const satisfies Record<
  TranslationKey,
  string
>
