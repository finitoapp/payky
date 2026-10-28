import type {
  CashuMintUrlInvalidError,
  MintFailure,
} from "@payky/core/modules/cashu/cashu-errors"
import type { TranslationKey } from "./i18n/resources.ts"

/** The message for each way trusting a mint by URL can fail (cashu/0016). */
export const cashuMintAddErrorKeys = {
  CashuMintUrlInvalid: "settings.cashuMints.addError.invalid",
  MintUnreachable: "settings.cashuMints.addError.unreachable",
  MintRejected: "settings.cashuMints.addError.rejected",
} satisfies Record<
  (CashuMintUrlInvalidError | MintFailure)["type"],
  TranslationKey
>
