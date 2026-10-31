import { describe, expect, test } from "vitest"
import {
  isMeltUnderWay,
  isMintRefusal,
  isRecoverableOutputCollision,
  readMintAnswer,
} from "./cashu-mint-errors.ts"

/** A mint's error answer as cashu-ts throws it: the detail and the code. */
const answer = (code: number | null, detail: string) =>
  Object.assign(new Error(detail), code === null ? {} : { code })

describe("a mint's answer is read in both NUT-00 code sets (cashu/0037)", () => {
  test("outputs signed before are a collision under 11003 and the legacy 10002", () => {
    for (const error of [
      answer(11003, "Outputs already signed"),
      answer(10002, "Blinded Message is already signed"),
    ]) {
      expect(readMintAnswer(error)).toBe("outputsSigned")
      expect(isRecoverableOutputCollision(error)).toBe(true)
    }
  })

  test("11005 is a refusal, not a collision, in either code set", () => {
    for (const error of [
      answer(11005, "Transaction is not balanced (inputs != outputs)"),
      answer(11005, "Unit in request is not supported"),
    ]) {
      expect(readMintAnswer(error)).toBe("refused")
      expect(isRecoverableOutputCollision(error)).toBe(false)
      expect(isMintRefusal(error)).toBe(true)
    }
  })

  test("11002 is proofs pending only when its wording says so", () => {
    expect(readMintAnswer(answer(11002, "Proofs are pending"))).toBe(
      "proofsPending"
    )
    expect(
      readMintAnswer(
        answer(11002, "Transaction is not balanced (inputs != outputs)")
      )
    ).toBe("refused")
  })

  test("outputs pending are a collision, never inputs pending", () => {
    const error = answer(11004, "Outputs are pending")
    expect(readMintAnswer(error)).toBe("outputsPending")
    expect(isRecoverableOutputCollision(error)).toBe(true)
  })

  test("11003 and 11004 decide by their wording: outputs in the current set, a secret in the legacy one", () => {
    const signed = answer(11003, "Blinded Message is already signed")
    expect(readMintAnswer(signed)).toBe("outputsSigned")
    expect(isRecoverableOutputCollision(signed)).toBe(true)
    // Nutshell before the renumbering: SecretTooLongError, NoSecretInProofsError.
    for (const error of [
      answer(11003, "secret too long"),
      answer(11004, "no secret in proofs"),
    ]) {
      expect(readMintAnswer(error)).toBe("refused")
      expect(isRecoverableOutputCollision(error)).toBe(false)
      expect(isMintRefusal(error)).toBe(true)
    }
  })

  test("pending reads as proofs pending only when the inputs are its subject", () => {
    for (const detail of ["proofs are pending.", "Token Pending"])
      expect(readMintAnswer(answer(11000, detail))).toBe("proofsPending")
    for (const detail of [
      "Pending melt quote has no pending proofs.",
      "Mint quote already pending.",
    ])
      expect(readMintAnswer(answer(11000, detail))).toBe("refused")
  })

  test("an answer with no code is the mint's word only by its wording, and no refusal", () => {
    const spent = answer(null, "Token already spent.")
    expect(readMintAnswer(spent)).toBe("proofsSpent")
    expect(isMintRefusal(spent)).toBe(false)
    const lost = answer(null, "Failed to fetch")
    expect(readMintAnswer(lost)).toBeNull()
    expect(isMintRefusal(lost)).toBe(false)
  })

  test("a rotated keyset is a refusal worth trying again", () => {
    const error = Object.assign(new Error("stale keyset"), {
      name: "StaleKeysetError",
    })
    expect(readMintAnswer(error)).toBe("staleKeyset")
    expect(isMintRefusal(error)).toBe(true)
  })
})

describe("a melt refusal that says the melt may be paying is no final refusal (cashu/0037)", () => {
  test("a pending quote, a paid invoice and pending inputs say the melt may be paying", () => {
    for (const error of [
      answer(20005, "Quote is pending."),
      answer(20006, "Invoice already paid."),
      answer(11002, "Proofs are pending."),
      answer(11012, "Token Pending"),
      answer(null, "quote is pending"),
    ])
      expect(isMeltUnderWay(error)).toBe(true)
    expect(readMintAnswer(answer(20005, "Quote is pending."))).toBe(
      "quotePending"
    )
    expect(readMintAnswer(answer(20006, "Invoice already paid."))).toBe(
      "quotePaid"
    )
  })

  test("any other refusal still says nothing was paid", () => {
    for (const error of [
      answer(11002, "Transaction is not balanced (inputs != outputs)"),
      answer(11001, "Token already spent."),
      answer(20007, "quote expired"),
      answer(11000, "Pending melt quote has no pending proofs."),
      answer(11000, "Mint quote already pending."),
    ]) {
      expect(isMeltUnderWay(error)).toBe(false)
      expect(isMintRefusal(error)).toBe(true)
    }
  })
})
