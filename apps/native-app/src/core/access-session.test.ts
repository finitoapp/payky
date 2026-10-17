import { sessionIdleTimeoutMs } from "@payky/core/modules/access/access-types"
import { describe, expect, test } from "vitest"
import {
  endsSessionOnAppState,
  isIdleExpired,
  sessionAfterPromptUnlock,
  sessionOutlivesAccount,
} from "./access-session.ts"

const a = "account-a" as never
const b = "account-b" as never

describe("PIN session end rules (access/0005)", () => {
  test("five minutes idle is still alive, one millisecond more ends it", () => {
    expect(isIdleExpired(1000, 1000 + sessionIdleTimeoutMs)).toBe(false)
    expect(isIdleExpired(1000, 1000 + sessionIdleTimeoutMs + 1)).toBe(true)
  })

  test("going to the background ends the session, staying active does not", () => {
    expect(endsSessionOnAppState("background")).toBe(true)
    expect(endsSessionOnAppState("active")).toBe(false)
  })

  test("a session ends when the account changes", () => {
    expect(sessionOutlivesAccount({ accountId: a }, a)).toBe(true)
    expect(sessionOutlivesAccount({ accountId: a }, b)).toBe(false)
    expect(sessionOutlivesAccount(null, b)).toBe(true)
  })

  test("a one-shot PIN starts no session, the recovery phrase does", () => {
    expect(sessionAfterPromptUnlock("pin", a)).toBeNull()
    expect(sessionAfterPromptUnlock("phrase", a)).toEqual({ accountId: a })
  })
})
