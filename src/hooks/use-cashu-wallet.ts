import { useAtomValue } from "jotai"

import { cashuWalletAtom } from "@/atoms/cashu-wallet.ts"
import type { CashuWallet } from "@/core/cashu/cashu-wallet.ts"

/** The active account's cashu wallet — the same instance `useAppRun` hands to Tasks. */
export const useCashuWallet = (): CashuWallet => useAtomValue(cashuWalletAtom)
