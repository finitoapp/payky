import type { en } from "./en.ts"
import { type Language, resources, type TranslationKey } from "./resources.ts"

/**
 * The `{name}`-style placeholder names a translation key's English source
 * string requires. English is the source of truth for translation keys
 * (see AGENTS.md), so params are derived from `en`, not the active language.
 */
type ExtractParams<S extends string> =
  S extends `${string}{${infer Param}}${infer Rest}`
    ? Param | ExtractParams<Rest>
    : never
type ParamsFor<K extends TranslationKey> = ExtractParams<(typeof en)[K]>

/**
 * Distributes over `K` (via the `K extends TranslationKey` naked-type-param
 * trick) so a call site whose key isn't a literal — e.g. a `TranslationKey`
 * value read from data — degrades to "params optional" instead of unioning
 * every key's params into one impossible-to-satisfy requirement.
 */
export type ParamsArgs<K extends TranslationKey> = K extends TranslationKey
  ? [ParamsFor<K>] extends [never]
    ? [params?: undefined]
    : [params: Readonly<Record<ParamsFor<K>, string | number>>]
  : never

function interpolate(
  text: string,
  params: Readonly<Record<string, string | number>>
): string {
  return Object.entries(params).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    text
  )
}

/** The `t` function both apps' `useTranslation` hooks return for a language. */
export const createTranslate =
  (language: Language) =>
  <K extends TranslationKey>(key: K, ...args: ParamsArgs<K>): string => {
    const [params] = args as [
      Readonly<Record<string, string | number>> | undefined,
    ]
    const text = resources[language][key]
    return params === undefined ? text : interpolate(text, params)
  }
