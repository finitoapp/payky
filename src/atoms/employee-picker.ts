import { atom } from "jotai"

/**
 * Whether a PoS station's "who's selling" picker is open. The station shell
 * hosts the one picker; the header chip and a charge with nobody picked open
 * it.
 */
export const employeePickerOpenAtom = atom(false)
