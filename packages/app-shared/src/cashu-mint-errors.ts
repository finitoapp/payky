import type { CashuMintUrlInvalidError } from "@payky/core/cashu/cashu-mints"
import type { MintFailure } from "@payky/core/cashu/cashu-wallet"
import type { TranslationKey } from "./i18n/resources.ts"

/** The message for each way adding a mint by URL can fail (cashu.md §7). */
export const cashuMintAddErrorKeys = {
  CashuMintUrlInvalid: "settings.cashuMints.addError.invalid",
  MintUnreachable: "settings.cashuMints.addError.unreachable",
  MintRejected: "settings.cashuMints.addError.rejected",
} satisfies Record<
  (CashuMintUrlInvalidError | MintFailure)["type"],
  TranslationKey
>
