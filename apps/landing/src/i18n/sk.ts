import type { TranslationKey } from "./en.ts"
import { skCommon } from "./sk/common.ts"
import { skLanding } from "./sk/landing.ts"
export const sk = { ...skCommon, ...skLanding } as const satisfies Record<
  TranslationKey,
  string
>
