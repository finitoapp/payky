// Runs the Maestro flows: `bun e2e/scripts/run.ts --platform web|android
// [--build] [--dev] [flow.yaml ...]` (all of e2e/flows by default). Builds the
// e2e app when missing or with --build, writes the strings, runs, and leaves
// JUnit reports and screenshots in e2e/.generated/report. With --dev, Android
// runs a debug build on an e2e Metro, so a JS change needs no rebuild. See
// e2e/AGENTS.md.
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { parseArgs } from "node:util"
import { $ } from "bun"
import { serveWeb } from "./serve-web.ts"

const appDir = resolve(import.meta.dirname, "../..")
const e2eDir = join(appDir, "e2e")
const generated = join(e2eDir, ".generated")
const webPort = 8790
// Not 8081: a developer's own Metro (without the e2e switch) may hold it.
const metroPort = 8792
const appId = "me.payky.nativepreview"
const maestro =
  Bun.which("maestro") ?? join(process.env.HOME ?? "", ".maestro/bin/maestro")

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    platform: { type: "string" },
    build: { type: "boolean", default: false },
    dev: { type: "boolean", default: false },
  },
  allowPositionals: true,
})
const platform = values.platform
if (platform !== "web" && platform !== "android") {
  console.error("--platform web|android is required")
  process.exit(2)
}

const reportDir = join(generated, "report", platform)

process.env.EXPO_PUBLIC_PAYKY_E2E = "1"
process.env.MAESTRO_CLI_NO_ANALYTICS = "1"
process.env.MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED = "true"

await $`bun ${join(e2eDir, "scripts/generate-strings.ts")}`
rmSync(reportDir, { recursive: true, force: true })
mkdirSync(reportDir, { recursive: true })

/** The .yaml files at `path`, a flow file or a folder of them. */
const yamlFiles = (path: string): ReadonlyArray<string> =>
  path.endsWith(".yaml")
    ? [path]
    : (readdirSync(path, { recursive: true }) as string[])
        .filter((file) => file.endsWith(".yaml"))
        .map((file) => join(path, file))

const flows = (positionals.length > 0 ? positionals : [join(e2eDir, "flows")])
  .flatMap((path) => yamlFiles(resolve(path)))
  .sort()

/** The flow's header `tags:` (the part before `---`), for platform filtering. */
const flowTags = async (flow: string): Promise<ReadonlyArray<string>> => {
  const header = (await Bun.file(flow).text()).split(/^---$/m)[0] ?? ""
  const parsed = Bun.YAML.parse(header) as { tags?: ReadonlyArray<string> }
  return parsed?.tags ?? []
}

const skipTag = {
  web: ["android-only", "ios-only"],
  android: ["web-only", "ios-only"],
}[platform]
const runnable: string[] = []
for (const flow of flows)
  if (!(await flowTags(flow)).some((tag) => skipTag.includes(tag)))
    runnable.push(flow)

const exitCode = platform === "web" ? await runWeb() : await runAndroid()
console.log(`\nreports: ${relative(process.cwd(), reportDir)}`)
process.exit(exitCode)

async function runWeb(): Promise<number> {
  const webDir = join(generated, "web")
  if (values.build || !existsSync(join(webDir, "index.html")))
    await $`bun x expo export --platform web --output-dir ${webDir}`.cwd(appDir)
  const server = serveWeb(webDir, webPort)
  const baseUrl = `http://127.0.0.1:${webPort}/`
  const wrappers = join(generated, "web-flows")
  rmSync(wrappers, { recursive: true, force: true })
  mkdirSync(wrappers, { recursive: true })

  // Web needs a `url:` header and keeps OPFS between the flows of one
  // invocation, so each flow runs alone through a wrapper (section 9 of the
  // plan, e2e/AGENTS.md).
  const failed: string[] = []
  for (const flow of runnable) {
    const name = relative(join(e2eDir, "flows"), flow)
      .replace(/\.yaml$/, "")
      .replaceAll("/", "__")
    const wrapper = join(wrappers, `${name}.yaml`)
    await Bun.write(
      wrapper,
      `url: \${BASE_URL}\nname: ${name}\n---\n- runFlow: ${flow}\n`
    )
    const result =
      await $`${maestro} test -p web --headless --screen-size 412x915 -e BASE_URL=${baseUrl} -e APP_ID=${baseUrl} --format junit --output ${join(reportDir, `${name}.xml`)} --test-output-dir ${join(reportDir, name)} ${wrapper}`.nothrow()
    if (result.exitCode !== 0) failed.push(name)
  }
  server.stop(true)
  console.log(
    `\nweb: ${runnable.length - failed.length}/${runnable.length} passed${failed.length > 0 ? `; failed: ${failed.join(", ")}` : ""}`
  )
  return failed.length > 0 ? 1 : 0
}

async function runAndroid(): Promise<number> {
  // Never the user's own phone: an emulator unless ANDROID_SERIAL names a device.
  const devices = (await $`adb devices`.text())
    .split("\n")
    .filter((line) => line.endsWith("\tdevice"))
    .map((line) => line.split("\t")[0] ?? "")
  const serial =
    process.env.ANDROID_SERIAL ??
    devices.find((device) => device.startsWith("emulator-"))
  if (serial === undefined) {
    console.error("no emulator running; start one or set ANDROID_SERIAL")
    return 2
  }
  const variant = values.dev ? "debug" : "release"
  const apk = join(generated, values.dev ? "app-e2e-debug.apk" : "app-e2e.apk")
  if (values.build || !existsSync(apk)) {
    const androidDir = join(appDir, "android")
    if (!existsSync(androidDir))
      await $`bun x expo prebuild --platform android --no-install`.cwd(appDir)
    // The JS bundle task does not see env changes; removing its output makes
    // it bundle again with EXPO_PUBLIC_PAYKY_E2E=1.
    rmSync(join(androidDir, "app/build/generated/assets/react/release"), {
      recursive: true,
      force: true,
    })
    const abi = (
      await $`adb -s ${serial} shell getprop ro.product.cpu.abi`.text()
    ).trim()
    const task = values.dev ? "assembleDebug" : "assembleRelease"
    await $`./gradlew ${task} -PreactNativeArchitectures=${abi}`
      .cwd(androidDir)
      .env({ ...process.env, SENTRY_DISABLE_AUTO_UPLOAD: "true" })
    await Bun.write(
      apk,
      Bun.file(
        join(androidDir, `app/build/outputs/apk/${variant}/app-${variant}.apk`)
      )
    )
  }
  const metro = values.dev ? await startMetro(serial) : undefined
  await $`adb -s ${serial} install -r ${apk}`
  const result =
    await $`${maestro} --device ${serial} test -e BASE_URL=payky-native-preview:// -e APP_ID=${appId} ${metro === undefined ? [] : ["-e", `DEV_URL=${metro.url}`]} --format junit --output ${join(reportDir, "android.xml")} --test-output-dir ${reportDir} ${runnable}`.nothrow()
  metro?.stop()
  return result.exitCode
}

/**
 * An e2e Metro for the debug build (reused when one already answers on
 * `metroPort`). `url` is the
 * dev-client link the flows launch the app with (subflows/launch.yaml),
 * without the dev menu's first-run sheet, launch menu and tools button.
 */
async function startMetro(
  serial: string
): Promise<{ readonly url: string; readonly stop: () => void }> {
  const status = `http://127.0.0.1:${metroPort}/status`
  const running = async () =>
    (
      await fetch(status).then(
        (r) => r.text(),
        () => ""
      )
    ).includes("running")
  const process_ = (await running())
    ? undefined
    : Bun.spawn(["bun", "x", "expo", "start", "--port", String(metroPort)], {
        cwd: appDir,
        // Explicitly: a child does not see EXPO_PUBLIC_PAYKY_E2E set above,
        // and Metro without it bundles the app with the bridge turned off.
        env: { ...process.env },
        stdout: "ignore",
        stderr: "inherit",
      })
  while (!(await running())) await Bun.sleep(1000)
  // An emulator reaches the host at 10.0.2.2, which survives Maestro
  // restarting its device server (that drops `adb reverse` rules).
  const host = serial.startsWith("emulator-") ? "10.0.2.2" : "127.0.0.1"
  if (host === "127.0.0.1")
    await $`adb -s ${serial} reverse tcp:${metroPort} tcp:${metroPort}`.quiet()
  const bundle = encodeURIComponent(`http://${host}:${metroPort}`)
  return {
    url: `payky-native-preview://expo-development-client/?url=${bundle}&__expo_disable_onboarding=1&__expo_disable_auto_launch=1&__expo_disable_fab=1`,
    stop: () => process_?.kill(),
  }
}
