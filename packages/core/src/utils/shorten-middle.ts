/** Keep both ends of an identifier when shortening it for display. */
export const shortenMiddle = (
  value: string,
  head: number,
  tail: number
): string =>
  value.length <= head + tail + 1
    ? value
    : `${value.slice(0, head)}…${value.slice(-tail)}`
