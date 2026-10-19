import { useMemo } from "react"
import Svg, { Path, Rect } from "react-native-svg"
import { qrPath } from "./qr-matrix.ts"

const quietZone = 2

/**
 * A QR drawn on a white square, whatever the theme: scanners need contrast.
 * Without `size` it fills its parent, as web's `QRCodeSVG className="size-full"`.
 */
export function QrCode({
  value,
  size,
}: {
  readonly value: string
  readonly size?: number
}) {
  const { size: modules, path } = useMemo(() => qrPath(value), [value])
  const side = modules + quietZone * 2
  return (
    <Svg
      width={size ?? "100%"}
      height={size ?? "100%"}
      viewBox={`0 0 ${side} ${side}`}
    >
      <Rect width={side} height={side} fill="#fff" />
      <Path
        d={path}
        fill="#000"
        transform={`translate(${quietZone} ${quietZone})`}
      />
    </Svg>
  )
}
