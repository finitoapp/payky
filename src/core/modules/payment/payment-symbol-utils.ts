import {
  type DateString,
  SpecificSymbol,
  VariableSymbol,
} from "@/core/modules/shared/schema.ts"

/**
 * The two symbols a payer quotes on a bank transfer, derived from the
 * payment's own number: the variable symbol is its serial, the specific symbol
 * its date as `YYMMDD`.
 *
 * One call site each, and named anyway — these are the format
 * `ibanReconciliationCandidateByAccountTransactionIdQuery` matches an incoming
 * transaction against, so they are a contract with the bank rather than
 * expression noise. Inline, the second is three `slice` calls that read as
 * nothing in particular.
 */
export const createVariableSymbolFromSerialNumber = (
  serialNumber: number
): VariableSymbol => VariableSymbol(String(serialNumber))

/**
 * A PoS station's payments carry its number before the date
 * (station/0007): stations number their payments on their own, so without
 * it a station's payment and the owner's could quote the same symbols.
 */
export const createSpecificSymbolFromDate = (
  date: DateString,
  stationNumber: number | null = null
): SpecificSymbol =>
  SpecificSymbol(
    `${stationNumber ?? ""}${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}`
  )
