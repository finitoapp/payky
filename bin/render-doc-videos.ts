import { mkdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { bundle } from "@remotion/bundler"
import { renderMedia, selectComposition } from "@remotion/renderer"
import { paykyWebpackOverride } from "../remotion/webpack-override.ts"

/**
 * Renders the raw Playwright captures produced by generate-doc-videos.ts
 * through the Remotion composition (phone frame + auto-synced captions)
 * into final mp4s, one per scenario name (see remotion/Root.tsx). Split from
 * the capture script so the composition can be iterated on (styling,
 * timing, layout) without re-recording every time.
 */
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const entryPoint = `${projectRoot}/remotion/index.ts`
const publicDir = `${projectRoot}/remotion/public`
const outputDirectory = `${projectRoot}/docs/videos/cs`
const language = "cs"
const scenarioNames = ["payment", "bill"] as const

const requestedScenarioNames = process.env.PAYKY_VIDEO_SCENARIOS?.split(",")
  .map((name) => name.trim())
  .filter((name) => name !== "")

const selectedScenarioNames =
  requestedScenarioNames === undefined
    ? scenarioNames
    : scenarioNames.filter((name) => requestedScenarioNames.includes(name))

async function run(): Promise<void> {
  console.info("Bundling the Remotion project...")
  const bundleLocation = await bundle({
    entryPoint,
    publicDir,
    webpackOverride: paykyWebpackOverride,
  })

  await mkdir(outputDirectory, { recursive: true })

  for (const name of selectedScenarioNames) {
    const compositionId = `${name}-${language}`
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: compositionId,
    })

    const outputLocation = `${outputDirectory}/${name}.mp4`
    console.info(`Rendering ${compositionId}...`)
    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation,
    })

    console.info(`Wrote ${outputLocation}`)
  }
}

await run()
