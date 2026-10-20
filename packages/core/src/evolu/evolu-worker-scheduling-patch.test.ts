import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { describe, expect, test } from "vitest"

/**
 * `patches/@evolu%2Fcommon@*.patch` delivers Evolu's in-memory worker messages
 * (the React Native SharedWorker and DbWorker) on React Native's runtime
 * scheduler instead of `setTimeout(fn, 0)`, which waits for a display frame
 * per hop there and made every query round trip 35-75 ms. The choice is made
 * once, when the module loads, so this reads the installed module: an Evolu
 * upgrade that drops the patch fails here first.
 */
describe("evolu worker scheduling patch", () => {
  test("schedules in-memory worker deliveries on nativeRuntimeScheduler", () => {
    const require = createRequire(import.meta.url)
    const worker = readFileSync(
      join(dirname(require.resolve("@evolu/common")), "Worker.js"),
      "utf8"
    )
    const scheduling = worker.slice(worker.indexOf("const scheduleWorkerTask"))

    expect(worker).toContain("globalThis.nativeRuntimeScheduler")
    expect(worker).toContain("unstable_scheduleCallback(")
    expect(scheduling).toContain("scheduleMacrotask(")
    expect(scheduling).not.toMatch(
      /setTimeout\(\(\) => \{\s+pendingWorkerTaskIds/u
    )
  })
})
