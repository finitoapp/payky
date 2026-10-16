/** The non-empty lines of `text`, the first `max` of them and a count of the rest. */
export const takeLines = (text: string, max: number): string => {
  const lines = text.split("\n").filter((line) => line !== "")
  return lines.length > max
    ? [...lines.slice(0, max), `… ${lines.length - max} more lines`].join("\n")
    : lines.join("\n")
}
