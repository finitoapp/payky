import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

/** Comma-separated scenario names; blank entries are dropped. */
const ScenarioListSchema = z.string().transform((value) =>
  value
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "")
)

/**
 * The doc-capture scripts' environment. Each list, when set, regenerates only
 * the scenarios it names instead of all of them.
 */
export const docEnv = createEnv({
  server: {
    PAYKY_SCREENSHOT_SCENARIOS: ScenarioListSchema.optional(),
    // Shared by `generate-doc-videos.ts` and `render-doc-videos.ts`.
    PAYKY_VIDEO_SCENARIOS: ScenarioListSchema.optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
