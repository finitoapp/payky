import { enCommon } from "./en/common.ts"
import { enLanding } from "./en/landing.ts"
export const en = { ...enCommon, ...enLanding } as const
export type TranslationKey = keyof typeof en
