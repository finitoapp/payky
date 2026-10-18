/**
 * Groups a long identifier into blocks of four for review — a bitcoin
 * address or an IBAN. Casing is preserved: Base58 addresses are
 * case-sensitive, so lowercasing here would show the user a string that is
 * not the one being paid.
 */
export const formatAddressGroups = (address: string): string =>
  address.replaceAll(/\s+/gu, "").replaceAll(/(.{4})(?=.)/gu, "$1 ")

/**
 * A countdown's time left, as `m:ss`, or `h:mm:ss` from an hour up. Seconds
 * round up, so it shows 0:01 until the time is really out, never 0:00 early.
 */
export const formatCountdown = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, "0")
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`
}
