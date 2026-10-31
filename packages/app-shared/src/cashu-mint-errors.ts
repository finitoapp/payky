import type {
  CashuLastTrustedMintError,
  CashuMintNotTrustedError,
  CashuMintsNotSyncedError,
  CashuMintsStillSyncingError,
  CashuMintUrlInvalidError,
  MintFailure,
} from "@payky/core/modules/cashu/cashu-errors"
import type { TranslationKey } from "./i18n/resources.ts"

/**
 * The message for each way trusting a mint by URL can fail (cashu/0015,
 * cashu/0013).
 */
export const cashuMintAddErrorKeys = {
  CashuMintUrlInvalid: "settings.cashuMints.addError.invalid",
  CashuMintsNotSynced: "settings.cashuMints.notSynced",
  MintUnreachable: "settings.cashuMints.addError.unreachable",
  MintRejected: "settings.cashuMints.addError.rejected",
  CashuMintUnsupported: "settings.cashuMints.addError.unsupported",
} satisfies Record<
  (CashuMintUrlInvalidError | CashuMintsNotSyncedError | MintFailure)["type"],
  TranslationKey
>

/**
 * The message for each way choosing a mint for payments can fail
 * (cashu/0018, cashu/0013).
 */
export const cashuSetDefaultMintErrorKeys = {
  CashuMintNotTrusted: "settings.cashuMints.setDefaultError.untrusted",
  CashuMintsNotSynced: "settings.cashuMints.notSynced",
} satisfies Record<
  (CashuMintNotTrustedError | CashuMintsNotSyncedError)["type"],
  TranslationKey
>

/**
 * The message for each way untrusting a mint can fail (cashu/0015,
 * cashu/0018).
 */
export const cashuUntrustMintErrorKeys = {
  CashuLastTrustedMint: "settings.cashuMints.untrustError.last",
  CashuMintsNotSynced: "settings.cashuMints.notSynced",
} satisfies Record<
  (CashuLastTrustedMintError | CashuMintsNotSyncedError)["type"],
  TranslationKey
>

/**
 * The message for each way seeding the default mint on the merchant's word
 * can fail (cashu/0013).
 */
export const cashuSeedMintErrorKeys = {
  CashuMintsStillSyncing: "settings.cashuMints.blocked.stillSyncing",
} satisfies Record<CashuMintsStillSyncingError["type"], TranslationKey>
