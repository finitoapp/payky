import { atom } from "jotai"

import { accountAtom } from "@/atoms/account.ts"
import { linkyStoreProviderAtom } from "@/atoms/linky-store.ts"
import {
  type CashuWallet,
  createCashuWallet,
} from "@/core/cashu/cashu-wallet.ts"
import {
  cashuMnemonicToWalletSeed,
  deriveDefaultCashuWalletMnemonic,
} from "@/core/modules/shared/key-derivation.ts"

/**
 * The one cashu wallet for the active account, shared by `useAppRun` (payment
 * preparation) and the background jobs (settlement): both must see the same
 * topup watchers, so neither may build its own. Its proofs are Linky's — the
 * stores come from the Linky store — and nothing loads until a method is
 * called. A new account (or Evolu client) replaces the wallet and disposes
 * the previous one.
 */
export const cashuWalletAtom = atom<Promise<CashuWallet>>(
  async (get, { signal }) => {
    const [account, linkyStoreProvider] = await Promise.all([
      get(accountAtom),
      get(linkyStoreProviderAtom),
    ])
    const wallet = createCashuWallet({
      seed: cashuMnemonicToWalletSeed(
        deriveDefaultCashuWalletMnemonic(account.masterKey)
      ),
      storage: localStorage,
      loadStores: async () => {
        const { wallet: repository } = await linkyStoreProvider.get()
        return repository
      },
    })

    signal.addEventListener(
      "abort",
      () => {
        void wallet[Symbol.asyncDispose]()
      },
      { once: true }
    )

    return wallet
  }
)
