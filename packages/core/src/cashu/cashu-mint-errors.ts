/**
 * What a mint's error answer means (NUT-00, cashu/0037). The code set was
 * renumbered: until 2026 an output signed before was 10002, 11002 an
 * unbalanced transaction, 11003 a secret too long, 11004 no secret in the
 * proofs and 11005 an unsupported unit; since, 11002 is proofs pending,
 * 11003 outputs signed, 11004 outputs pending, 11005 an unbalanced
 * transaction. Mints of both generations are in use (cashu/0033), so a code
 * that kept its meaning decides alone, and one whose meaning moved (11002
 * to 11005) decides nothing by itself: the detail's wording does, as it does
 * for a mint that answers with no code.
 */

export type MintAnswer =
  /** The outputs were signed before, by this call or another. */
  | "outputsSigned"
  /** Another call is signing these outputs right now. */
  | "outputsPending"
  /** The request names one output twice. */
  | "duplicateOutputs"
  /** The inputs are spent. */
  | "proofsSpent"
  /** Another call is spending the inputs right now (cashu/0030). */
  | "proofsPending"
  /** The mint quote's outputs were issued already. */
  | "quoteIssued"
  /** The melt quote is being paid right now, by this call or another. */
  | "quotePending"
  /** The melt quote's invoice was paid already, by this call or another. */
  | "quotePaid"
  /** The keyset was rotated away; the wallet has loaded the new one. */
  | "staleKeyset"
  /** Any other refusal with a NUT-00 code. */
  | "refused"

/** The NUT-00 code of a mint's answer, when it gave one. */
export const mintErrorCode = (error: unknown): number | null =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof error.code === "number"
    ? error.code
    : null

/** Codes that mean the same in both code sets. */
const codeAnswers: ReadonlyMap<number, MintAnswer> = new Map([
  [10002, "outputsSigned"],
  [11001, "proofsSpent"],
  [11008, "duplicateOutputs"],
  [20002, "quoteIssued"],
  [20005, "quotePending"],
  [20006, "quotePaid"],
])

/**
 * The wording each answer is read from, as Nutshell and CDK word it in
 * either generation. A phrase names its subject next to "pending", so
 * "Pending melt quote has no pending proofs." says nothing about inputs.
 */
const wordingAnswer = (message: string): MintAnswer | null => {
  if (
    message.includes("outputs have already been signed") ||
    message.includes("outputs already signed") ||
    message.includes("already been signed before") ||
    message.includes("blinded message is already signed") ||
    message.includes("keyset id already signed")
  )
    return "outputsSigned"
  if (/\boutputs? (?:are |is )?pending\b/u.test(message))
    return "outputsPending"
  if (message.includes("duplicate outputs")) return "duplicateOutputs"
  if (message.includes("already spent")) return "proofsSpent"
  if (/\b(?:proofs?|tokens?|inputs?) (?:are |is )?pending\b/u.test(message))
    return "proofsPending"
  if (message.includes("already issued")) return "quoteIssued"
  if (/\bquote (?:is )?pending\b/u.test(message)) return "quotePending"
  if (message.includes("invoice already paid")) return "quotePaid"
  return null
}

/**
 * What the mint said, or null when nothing says it was the mint's word: a
 * lost answer, a body that would not parse, a proxy's 4xx.
 */
export const readMintAnswer = (error: unknown): MintAnswer | null => {
  if (error instanceof Error && error.name === "StaleKeysetError")
    return "staleKeyset"
  const code = mintErrorCode(error)
  const byCode = code === null ? undefined : codeAnswers.get(code)
  if (byCode !== undefined) return byCode
  const byWording = wordingAnswer(
    (error instanceof Error ? error.message : "").toLowerCase()
  )
  if (byWording !== null) return byWording
  return code === null ? null : "refused"
}

/**
 * The mint itself refused the call, answering with a NUT-00 code: it signed
 * nothing, so the block reserved for it is refused for good (cashu/0029).
 * Anything else — a body that would not parse, a proxy's 4xx, a failure
 * unblinding a signed answer — may hide a call the mint did sign. cashu-ts's
 * answer to the mint's 12002 is a refusal too: the keyset it signed with was
 * rotated away, nothing was signed, and the operation is worth trying again.
 */
export const isMintRefusal = (error: unknown): boolean =>
  mintErrorCode(error) !== null || readMintAnswer(error) === "staleKeyset"

/**
 * A melt request's answer that says the melt may be paying: its inputs held
 * by another call, its quote being paid or paid already (cashu/0027). The
 * answer comes with a code, yet nothing in it says the invoice went unpaid,
 * so only the quote's state settles the melt (cashu/0027).
 */
export const isMeltUnderWay = (error: unknown): boolean => {
  const answer = readMintAnswer(error)
  return (
    answer === "proofsPending" ||
    answer === "quotePending" ||
    answer === "quotePaid"
  )
}

/** A failure the attempt loop recovers from by moving the counter. */
export const isRecoverableOutputCollision = (error: unknown): boolean => {
  const answer = readMintAnswer(error)
  return (
    answer === "outputsSigned" ||
    answer === "outputsPending" ||
    answer === "duplicateOutputs"
  )
}
