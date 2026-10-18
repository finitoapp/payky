import { encode } from "uqr"

/**
 * One SVG path covering every dark module of the QR for `value`, in module
 * units (one unit per module, no quiet zone), plus the side length. Medium
 * error correction, as the web `qrcode.react` default.
 */
export function qrPath(value: string): {
  readonly size: number
  readonly path: string
} {
  const { data, size } = encode(value, { ecc: "M", border: 0 })
  let path = ""
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${x} ${y}h1v1h-1z`
    })
  })
  return { size, path }
}
