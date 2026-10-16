import { z } from "zod"

/** The donation wallet's mnemonic, shared by every endpoint that opens it. */
export const DonateSparkMnemonicSchema = z.string().trim().min(1)

/**
 * Runs a `createEnv` per call rather than once at import, `null` when the env
 * does not validate: an unset or invalid value answers that one request as
 * "not configured" instead of failing the function's cold start, and the
 * tests set the env per case.
 */
export const loadServerEnv = <TEnv>(create: () => TEnv): TEnv | null => {
  try {
    return create()
  } catch {
    return null
  }
}

/** For `createEnv`'s `onValidationError`, which otherwise logs every issue. */
export const throwInvalidServerEnv = (): never => {
  throw new Error("Invalid server environment.")
}
