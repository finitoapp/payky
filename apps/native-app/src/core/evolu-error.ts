import type { EvoluError } from "@evolu/common/local-first"

/**
 * An Error for the error screen from an Evolu error, whose detail (an
 * `UnknownError`'s wrapped failure, such as a native library that does not
 * load) becomes its message.
 */
export const evoluErrorToError = (error: EvoluError): Error => {
  const detail =
    "error" in error &&
    typeof error.error === "object" &&
    error.error !== null &&
    "message" in error.error &&
    typeof error.error.message === "string"
      ? `: ${error.error.message}`
      : ""
  const converted = new Error(`${error.type}${detail}`)
  converted.name = "EvoluError"
  return converted
}
