import { resolve } from "node:path"
import sharp from "sharp"

/**
 * The PWA's maskable icons: the coin on the app's dark boot background.
 * A launcher fills the transparent parts of an `any` icon with white, so
 * without an opaque `maskable` icon the home screen shows a white square
 * behind the coin. The coin sits inside the 80% safe zone the maskable
 * spec guarantees stays visible whatever shape the launcher cuts.
 *
 * Run with `bun run bin/generate-maskable-icons.ts` after changing the coin.
 */
const SOURCE = resolve("public/pwa-icon-1024.png")
const BACKGROUND = "#17191B"
const SAFE_ZONE = 0.8
const SIZES = [192, 512] as const

for (const size of SIZES) {
  const coinSize = Math.round(size * SAFE_ZONE)
  const coin = await sharp(SOURCE).resize(coinSize, coinSize).png().toBuffer()
  const offset = Math.round((size - coinSize) / 2)
  await sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: coin, left: offset, top: offset }])
    .png()
    .toFile(resolve(`public/pwa-icon-maskable-${size}.png`))
  console.log(`public/pwa-icon-maskable-${size}.png`)
}
