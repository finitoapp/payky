import { atom } from "jotai"

import { accountAtom } from "@/atoms/account.ts"
import { consoleAtom } from "@/atoms/console.ts"
import type { LinkyStoreHandle } from "@/core/linky/linky-store.ts"

/**
 * Opens the account's Linky data on first use and shares that one store:
 * `get()` returns the same promise to every caller, so the cashu wallet and
 * the settings card never race two Evolu clients for one owner.
 */
export interface LinkyStoreProvider {
  readonly get: () => Promise<LinkyStoreHandle>
}

/**
 * The provider is a plain value, so reading it costs nothing: the Evolu 7
 * client, the shard subscriptions and the relay connection start only when
 * something asks for the store. A new account replaces the provider and
 * disposes whatever the previous one opened.
 */
export const linkyStoreProviderAtom = atom<Promise<LinkyStoreProvider>>(
  async (get, { signal }) => {
    const console = get(consoleAtom)
    const account = await get(accountAtom)
    let opened: Promise<LinkyStoreHandle> | undefined

    const open = (): Promise<LinkyStoreHandle> => {
      opened ??= import("@/core/linky/linky-browser-store.ts").then(
        ({ createBrowserLinkyStore }) =>
          createBrowserLinkyStore(account.masterKey, { console })
      )
      return opened
    }

    signal.addEventListener(
      "abort",
      () => {
        void opened?.then((handle) => handle[Symbol.asyncDispose]())
      },
      { once: true }
    )

    return { get: open }
  }
)

/** The opened Linky store; suspends until it is ready. */
export const linkyStoreAtom = atom<Promise<LinkyStoreHandle>>(async (get) => {
  const provider = await get(linkyStoreProviderAtom)
  return provider.get()
})
