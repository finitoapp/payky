import type { DeviceAccountId } from "@payky/core/evolu/device-client"
import { sessionIdleTimeoutMs } from "@payky/core/modules/access/access-types"

export type UnlockedVia = "pin" | "phrase"

/** Idle strictly longer than five minutes ends the session (access/0005). */
export const isIdleExpired = (lastActivity: number, now: number): boolean =>
  now - lastActivity > sessionIdleTimeoutMs

/**
 * Only `background` counts as leaving the app. `inactive` is iOS's state for
 * a system sheet or the app switcher gesture, which web's `visibilitychange`
 * does not treat as hidden either.
 */
export const endsSessionOnAppState = (state: string): boolean =>
  state === "background"

/** A session belongs to the account it was entered for (access/0005). */
export const sessionOutlivesAccount = (
  session: { readonly accountId: DeviceAccountId } | null,
  accountId: DeviceAccountId
): boolean => session === null || session.accountId === accountId

/**
 * What a PIN prompt starts: the recovery phrase opens a session (access/0006),
 * a one-shot PIN answers its action and starts none (access/0005).
 */
export const sessionAfterPromptUnlock = (
  via: UnlockedVia,
  accountId: DeviceAccountId
): { readonly accountId: DeviceAccountId } | null =>
  via === "phrase" ? { accountId } : null
