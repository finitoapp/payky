import { encode } from "uqr"

/**
 * One SVG path covering every dark module of the QR for `value`, in module
 * units (one unit per module, no quiet zone), plus the side length. Medium
 * error correction, as the web `qrcode.react` default.
 */
interface QrPath {
  readonly size: number
  readonly path: string
}

/**
 * Recent paths by value: switching payment tabs remounts the QR, and a
 * Lightning invoice's matrix is large. ponytail: a tiny FIFO, enough for the
 * one payment on screen; the oldest entry goes first.
 */
const recent = new Map<string, QrPath>()
const recentLimit = 8

export function qrPath(value: string): QrPath {
  const cached = recent.get(value)
  if (cached !== undefined) return cached
  const computed = computeQrPath(value)
  recent.set(value, computed)
  const oldest = recent.keys().next()
  if (recent.size > recentLimit && oldest.done !== true)
    recent.delete(oldest.value)
  return computed
}

function computeQrPath(value: string): QrPath {
  const { data, size } = encode(value, { ecc: "M", border: 0 })
  let path = ""
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${x} ${y}h1v1h-1z`
    })
  })
  return { size, path }
}
