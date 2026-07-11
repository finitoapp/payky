import { cs } from "@/i18n/cs.ts"
import { en } from "@/i18n/en.ts"
import { sk } from "@/i18n/sk.ts"

export const resources = { en, cs, sk } as const

export type Language = keyof typeof resources
export type { TranslationKey } from "@/i18n/en.ts"
