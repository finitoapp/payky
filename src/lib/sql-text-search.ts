import { kyselySql } from "@evolu/common"
import type {
  Expression,
  ExpressionBuilder,
  RawBuilder,
  StringReference,
} from "kysely"

/**
 * Every diacritic-bearing Latin letter (both cases) this app searches
 * across — Czech/Slovak plus common Western European accents — mapped to
 * its plain-ASCII base form. The single source of truth for
 * `foldDiacritics` (JS side) and `foldDiacriticsSql` (SQL side), so a search
 * term and a stored column always fold to the same value.
 */
const DIACRITICS_FOLD_MAP: ReadonlyArray<readonly [string, string]> = [
  ["á", "a"],
  ["Á", "a"],
  ["à", "a"],
  ["À", "a"],
  ["â", "a"],
  ["Â", "a"],
  ["ä", "a"],
  ["Ä", "a"],
  ["ã", "a"],
  ["Ã", "a"],
  ["å", "a"],
  ["Å", "a"],
  ["č", "c"],
  ["Č", "c"],
  ["ç", "c"],
  ["Ç", "c"],
  ["ď", "d"],
  ["Ď", "d"],
  ["é", "e"],
  ["É", "e"],
  ["è", "e"],
  ["È", "e"],
  ["ê", "e"],
  ["Ê", "e"],
  ["ë", "e"],
  ["Ë", "e"],
  ["ě", "e"],
  ["Ě", "e"],
  ["í", "i"],
  ["Í", "i"],
  ["ì", "i"],
  ["Ì", "i"],
  ["î", "i"],
  ["Î", "i"],
  ["ï", "i"],
  ["Ï", "i"],
  ["ň", "n"],
  ["Ň", "n"],
  ["ñ", "n"],
  ["Ñ", "n"],
  ["ó", "o"],
  ["Ó", "o"],
  ["ò", "o"],
  ["Ò", "o"],
  ["ô", "o"],
  ["Ô", "o"],
  ["ö", "o"],
  ["Ö", "o"],
  ["õ", "o"],
  ["Õ", "o"],
  ["ř", "r"],
  ["Ř", "r"],
  ["š", "s"],
  ["Š", "s"],
  ["ť", "t"],
  ["Ť", "t"],
  ["ú", "u"],
  ["Ú", "u"],
  ["ù", "u"],
  ["Ù", "u"],
  ["û", "u"],
  ["Û", "u"],
  ["ü", "u"],
  ["Ü", "u"],
  ["ů", "u"],
  ["Ů", "u"],
  ["ý", "y"],
  ["Ý", "y"],
  ["ÿ", "y"],
  ["ž", "z"],
  ["Ž", "z"],
]

/**
 * Lowercases and strips diacritics from user-facing text the same way
 * `foldDiacriticsSql` folds a SQL column, so a JS-normalized search term
 * matches consistently against it (for example "pivo" matches "Pivo" and
 * "PÍVO").
 */
export function foldDiacritics(text: string): string {
  let result = text.toLowerCase()
  for (const [accented, base] of DIACRITICS_FOLD_MAP) {
    result = result.split(accented).join(base)
  }
  return result
}

/**
 * Wraps a SQL expression in `lower()` plus one `replace()` per mapped
 * diacritic, so it can be compared with a `foldDiacritics`-normalized search
 * term using plain `LIKE`. Generic over any Kysely `Expression` — reusable
 * by any Evolu query that needs accent- and case-insensitive text matching.
 */
export function foldDiacriticsSql(
  expr: Expression<unknown>
): RawBuilder<string> {
  let folded = kyselySql<string>`lower(${expr})`
  for (const [accented, base] of DIACRITICS_FOLD_MAP) {
    folded = kyselySql<string>`replace(${folded}, ${accented}, ${base})`
  }
  return folded
}

const LIKE_ESCAPE_CHAR = "\\"

/**
 * Escapes `%`, `_`, and the escape character itself so raw user input can be
 * safely embedded as a `LIKE` substring pattern (pair with
 * `ESCAPE '${LIKE_ESCAPE_CHAR}'`).
 */
export function escapeLikePattern(raw: string): string {
  return raw.replace(/[\\%_]/g, (char) => `${LIKE_ESCAPE_CHAR}${char}`)
}

/**
 * Builds an `OR`-ed `LIKE` condition across `columns` that matches `term`
 * ignoring case and diacritics (so "pivo" matches "Pivo" and "PÍVO"). `term`
 * should be the raw, un-normalized user input. Generic over any Kysely
 * schema/table — reusable for free-text search on any Evolu query, not just
 * catalog items.
 */
export function buildDiacriticInsensitiveSearchCondition<
  DB,
  TB extends keyof DB,
>(
  eb: ExpressionBuilder<DB, TB>,
  columns: ReadonlyArray<StringReference<DB, TB>>,
  term: string
) {
  const pattern = `%${escapeLikePattern(foldDiacritics(term))}%`
  return eb.or(
    columns.map(
      (column) =>
        kyselySql<boolean>`${foldDiacriticsSql(eb.ref(column))} like ${pattern} escape ${LIKE_ESCAPE_CHAR}`
    )
  )
}
