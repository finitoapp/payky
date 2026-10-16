import type { EvoluOwnerDep } from "../deps.ts"
import type { EvoluDep } from "../modules/shared/evolu-deps.ts"

/**
 * The app Evolu deps nearly every action test runs with: the client and the
 * owner it writes as. Spread it into a test's deps object next to whatever
 * fakes that test adds, instead of spelling the pair out each time.
 */
export const evoluTestDeps = (
  evolu: EvoluDep["evolu"]
): EvoluDep & EvoluOwnerDep => ({
  evolu,
  evoluOwner: evolu.appOwner,
})
