/**
 * Reconciles a `Map` of per-account sync sessions against the current list
 * of active accounts: sessions for accounts that disappeared are disposed,
 * sessions for accounts whose relevant fields changed are disposed and
 * recreated, and sessions for new accounts are created. Shared by the FIO
 * and Spark account-transaction sync jobs, which otherwise duplicated this
 * loop with only their key/equality/session types differing.
 *
 * Deliberately scoped to just this loop — the surrounding subscribeQuery
 * wiring, refresh queue, and any periodic recheck timer differ enough
 * between the two jobs (e.g. FIO's per-plugin check interval vs. Spark's
 * single job-wide one) that unifying them would cost more clarity than the
 * duplication they'd remove.
 */
export const reconcileAccountSyncSessions = async <TKey, TAccount, TSession>({
  sessions,
  activeAccounts,
  getKey,
  matches,
  createSession,
  disposeSession,
  onSessionStopped,
  onSessionStarted,
}: {
  readonly sessions: Map<TKey, TSession>
  readonly activeAccounts: ReadonlyArray<TAccount>
  readonly getKey: (account: TAccount) => TKey
  readonly matches: (session: TSession, account: TAccount) => boolean
  readonly createSession: (account: TAccount) => TSession
  readonly disposeSession: (session: TSession) => void | PromiseLike<void>
  readonly onSessionStopped?: (key: TKey) => void
  readonly onSessionStarted?: (
    key: TKey,
    account: TAccount,
    replacedExistingSync: boolean
  ) => void
}): Promise<void> => {
  const activeKeys = new Set(activeAccounts.map(getKey))

  for (const [key, session] of sessions) {
    if (activeKeys.has(key)) continue

    await disposeSession(session)
    sessions.delete(key)
    onSessionStopped?.(key)
  }

  for (const account of activeAccounts) {
    const key = getKey(account)
    const current = sessions.get(key)
    if (current !== undefined && matches(current, account)) continue

    if (current !== undefined) await disposeSession(current)

    const session = createSession(account)
    sessions.set(key, session)
    onSessionStarted?.(key, account, current !== undefined)
  }
}
