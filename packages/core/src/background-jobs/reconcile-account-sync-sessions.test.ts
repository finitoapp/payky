import { describe, expect, test, vi } from "vitest"
import { reconcileAccountSyncSessions } from "./reconcile-account-sync-sessions.ts"

interface FakeAccount {
  readonly id: string
  readonly value: number
}

interface FakeSession {
  readonly value: number
}

const createSession = (account: FakeAccount): FakeSession => ({
  value: account.value,
})

describe("reconcileAccountSyncSessions", () => {
  test("stops sessions for accounts that are no longer active", async () => {
    const sessions = new Map<string, FakeSession>([["a", { value: 1 }]])
    const disposeSession = vi.fn()
    const onSessionStopped = vi.fn()

    await reconcileAccountSyncSessions({
      sessions,
      activeAccounts: [],
      getKey: (account: FakeAccount) => account.id,
      matches: (session, account) => session.value === account.value,
      createSession,
      disposeSession,
      onSessionStopped,
    })

    expect(disposeSession).toHaveBeenCalledTimes(1)
    expect(onSessionStopped).toHaveBeenCalledWith("a")
    expect(sessions.has("a")).toBe(false)
  })

  test("leaves a matching session untouched", async () => {
    const existingSession = { value: 1 }
    const sessions = new Map<string, FakeSession>([["a", existingSession]])
    const disposeSession = vi.fn()
    const onSessionStarted = vi.fn()

    await reconcileAccountSyncSessions({
      sessions,
      activeAccounts: [{ id: "a", value: 1 }],
      getKey: (account: FakeAccount) => account.id,
      matches: (session, account) => session.value === account.value,
      createSession,
      disposeSession,
      onSessionStarted,
    })

    expect(disposeSession).not.toHaveBeenCalled()
    expect(onSessionStarted).not.toHaveBeenCalled()
    expect(sessions.get("a")).toBe(existingSession)
  })

  test("replaces a session whose account no longer matches", async () => {
    const oldSession = { value: 1 }
    const sessions = new Map<string, FakeSession>([["a", oldSession]])
    const disposeSession = vi.fn()
    const onSessionStarted = vi.fn()

    await reconcileAccountSyncSessions({
      sessions,
      activeAccounts: [{ id: "a", value: 2 }],
      getKey: (account: FakeAccount) => account.id,
      matches: (session, account) => session.value === account.value,
      createSession,
      disposeSession,
      onSessionStarted,
    })

    expect(disposeSession).toHaveBeenCalledWith(oldSession)
    expect(onSessionStarted).toHaveBeenCalledWith(
      "a",
      { id: "a", value: 2 },
      true
    )
    expect(sessions.get("a")).toEqual({ value: 2 })
  })

  test("creates a session for a newly active account", async () => {
    const sessions = new Map<string, FakeSession>()
    const disposeSession = vi.fn()
    const onSessionStarted = vi.fn()

    await reconcileAccountSyncSessions({
      sessions,
      activeAccounts: [{ id: "a", value: 1 }],
      getKey: (account: FakeAccount) => account.id,
      matches: (session, account) => session.value === account.value,
      createSession,
      disposeSession,
      onSessionStarted,
    })

    expect(disposeSession).not.toHaveBeenCalled()
    expect(onSessionStarted).toHaveBeenCalledWith(
      "a",
      { id: "a", value: 1 },
      false
    )
    expect(sessions.get("a")).toEqual({ value: 1 })
  })

  test("disposes the old session before creating its replacement", async () => {
    const oldSession = { value: 1 }
    const sessions = new Map<string, FakeSession>([["a", oldSession]])
    const callOrder: string[] = []

    await reconcileAccountSyncSessions({
      sessions,
      activeAccounts: [{ id: "a", value: 2 }],
      getKey: (account: FakeAccount) => account.id,
      matches: (session, account) => session.value === account.value,
      createSession: (account) => {
        callOrder.push("create")
        return createSession(account)
      },
      disposeSession: () => {
        callOrder.push("dispose")
      },
    })

    expect(callOrder).toEqual(["dispose", "create"])
  })
})
