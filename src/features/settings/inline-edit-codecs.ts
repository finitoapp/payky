import { z } from "zod"

import { NonEmptyString255Schema } from "@/core/modules/shared/schema.ts"

/**
 * The codecs inline-edit fields bridge their text through. Each one reads
 * `string` (what the control holds) on the input side and the stored value
 * on the output side, so the same object serves both directions.
 *
 * Their output side must not be a `.transform()` schema: `z.encode` runs it
 * backwards, and a transform has no backwards to run. That rules out the
 * `standardSchemaToZod` id schemas, which is why `optionalIdCodec` takes its
 * type as a parameter rather than the schema.
 */

/** A required text field; the schema does the trimming and the length cap. */
export const requiredTextCodec = z.codec(z.string(), NonEmptyString255Schema, {
  decode: (value) => value,
  encode: (value) => value,
})

/** The same, except blank means "not set". */
export const optionalTextCodec = z.codec(
  z.string(),
  NonEmptyString255Schema.nullable(),
  {
    decode: (value) => (value.trim() === "" ? null : value),
    encode: (value) => value ?? "",
  }
)

/** The value a select uses for its "not set" option. */
export const NO_OPTION = "none"

/**
 * A select over optional rows: the id as the option value, `NO_OPTION` for
 * the row not being set at all. The id itself is not re-validated — every
 * option value comes from a row the page already loaded, not from the user.
 */
export const optionalIdCodec = <T extends string>() =>
  z.codec(z.string(), z.custom<T | null>(), {
    decode: (value) => (value === NO_OPTION ? null : (value as T)),
    encode: (value) => value ?? NO_OPTION,
  })
