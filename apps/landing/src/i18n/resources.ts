import { cs } from "./cs.ts"
import { en } from "./en.ts"
import { sk } from "./sk.ts"

export const resources = { en, cs, sk } as const

export type Language = keyof typeof resources
export type { TranslationKey } from "./en.ts"
