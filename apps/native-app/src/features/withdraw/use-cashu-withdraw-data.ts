import { cashuAccountQuery } from "@payky/core/modules/account/account-queries"
import type { AccountId } from "@payky/core/modules/account/account-types"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"

/**
 * The account Cashu withdrawals are booked to: the Cashu account, even while
 * Cashu is off, since its ecash stays in the wallet shared with Linky.
 */
export const useCashuAccountId = (): AccountId | undefined =>
  useEvoluQuery(cashuAccountQuery).data[0]?.id
