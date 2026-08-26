import { NonEmptyString255 } from "@/core/modules/shared/schema.ts"

// Excludes 0/O and 1/I so a printed code can't be misread.
const TABLE_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
const TABLE_CODE_LENGTH = 8

/**
 * Generates a table's `code`. Not consumed by any feature yet — reserved for
 * a future QR code sticker that will let a scan resolve straight to this
 * table.
 */
export function generateTableCode(): NonEmptyString255 {
  let code = ""
  for (let i = 0; i < TABLE_CODE_LENGTH; i++) {
    const char =
      TABLE_CODE_ALPHABET[
        Math.floor(Math.random() * TABLE_CODE_ALPHABET.length)
      ]
    if (char === undefined) {
      throw new Error("Unreachable: index is always within alphabet bounds")
    }
    code += char
  }

  return NonEmptyString255(code)
}
