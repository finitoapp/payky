import { spawn } from "node:child_process"
import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import {
  type Browser,
  chromium,
  expect,
  type Locator,
  type Page,
  type Video,
} from "@playwright/test"
import {
  addCatalogItem,
  addTable,
  pageHeight,
  pageWidth,
  seedOnboarding,
  translate,
  translateValue,
} from "../e2e/fixtures.ts"
import type { TranslationKey } from "../src/i18n/resources.ts"
import type { CaptionTimelineFile } from "./video/captions.ts"
import {
  type CaptionTimeline,
  createCaptionTimeline,
  installFakeCursor,
  smoothClick,
  withCaption,
} from "./video/smooth-input.ts"

/**
 * Video-generation pipeline: Playwright recording (this script) + a Remotion
 * composition (see bin/render-doc-videos.ts). One language (cs) for now —
 * see remotion/Root.tsx for how a scenario's composition id/asset paths are
 * wired up; add a matching <Composition> there for any new scenario name.
 */
const language = "cs"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const rawVideosDirectory = `${projectRoot}/remotion/public/generated/${language}`
const appUrl = "http://127.0.0.1:4174"

function nameParam(key: TranslationKey, name: string): string {
  return translate(language, key).replace("{name}", name)
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

async function waitForApp(): Promise<void> {
  const deadline = Date.now() + 30_000

  while (Date.now() < deadline) {
    try {
      const response = await fetch(appUrl)
      if (response.ok) return
    } catch {
      // The development server is still starting.
    }

    await delay(250)
  }

  throw new Error("Timed out waiting for the documentation video server.")
}

interface VideoScenario {
  readonly name: "payment" | "bill"
  readonly capture: (page: Page, timeline: CaptionTimeline) => Promise<void>
}

/**
 * Skips the tip step if the payment-wait screen shows one (tips are seeded
 * on by default — see e2e-test-bridge.tsx). Waits for the IBAN tab either
 * way, so callers can rely on the payment-wait screen being ready after.
 */
async function passThroughTip(
  page: Page,
  timeline: CaptionTimeline,
  ibanTab: Locator
): Promise<void> {
  const skipTipButton = page.getByRole("button", {
    name: translate(language, "paymentTip.none"),
  })
  await ibanTab.or(skipTipButton).first().waitFor()

  if (await skipTipButton.isVisible()) {
    await withCaption(timeline, "Přeskočte dýško", async () => {
      await smoothClick(page, skipTipButton)
      await smoothClick(
        page,
        page.getByRole("button", {
          name: translate(language, "paymentTip.continue"),
        })
      )
    })
    await ibanTab.waitFor()
  }
}

/**
 * Picks a percentage tip preset on the payment-wait screen and continues.
 * Assumes tips are enabled (seeded on by default — see e2e-test-bridge.tsx),
 * so the preset button is there right after the "Pay" click.
 */
async function selectPercentageTip(
  page: Page,
  timeline: CaptionTimeline,
  ibanTab: Locator,
  percentage: number
): Promise<void> {
  const percentageButton = page.getByRole("button", {
    name: translateValue(
      language,
      "settings.tips.percentages.value",
      percentage
    ),
  })
  await percentageButton.waitFor()

  await withCaption(timeline, `Vyberte dýško ${percentage} %`, async () => {
    await smoothClick(page, percentageButton)
    await smoothClick(
      page,
      page.getByRole("button", {
        name: translate(language, "paymentTip.continue"),
      })
    )
  })
  await ibanTab.waitFor()
}

async function capturePayment(
  page: Page,
  timeline: CaptionTimeline
): Promise<void> {
  await seedOnboarding(page, language, { fiatCurrency: "CZK" })

  await withCaption(timeline, "Zadejte částku", async () => {
    await smoothClick(
      page,
      page.getByRole("button", { name: "5", exact: true })
    )
    await smoothClick(
      page,
      page.getByRole("button", {
        name: translate(language, "home.keypad.decimal"),
      })
    )
    await smoothClick(
      page,
      page.getByRole("button", { name: "9", exact: true })
    )
  })

  await withCaption(timeline, "Spusťte platbu", () =>
    smoothClick(
      page,
      page.getByRole("button", { name: translate(language, "home.pay") })
    )
  )

  const ibanTab = page.getByRole("tab", {
    name: translate(language, "paymentWait.method.iban"),
  })
  await passThroughTip(page, timeline, ibanTab)

  await withCaption(timeline, "Zobrazte QR kód pro IBAN", () =>
    smoothClick(page, ibanTab)
  )

  await expect(
    page.getByRole("button", {
      name: translate(language, "paymentWait.copyQr"),
    })
  ).toBeEnabled()
  await page.waitForTimeout(900)
}

const billCatalog = [
  { name: "Káva", price: "65" },
  { name: "Croissant", price: "55" },
  { name: "Sendvič", price: "89" },
  { name: "Pomerančový džus", price: "45" },
  { name: "Bagel", price: "60" },
  { name: "Ledový čaj", price: "55" },
] as const

const billCart = [
  { name: "Káva", quantity: 2 },
  { name: "Croissant", quantity: 1 },
] as const

const billTables = [
  { name: "Stůl 1", seatCount: "4" },
  { name: "Stůl 2", seatCount: "4" },
  { name: "Stůl 3", seatCount: "2" },
] as const

async function captureBill(
  page: Page,
  timeline: CaptionTimeline
): Promise<void> {
  await seedOnboarding(page, language, { fiatCurrency: "CZK" })
  for (const item of billCatalog) {
    await addCatalogItem(page, language, item)
  }
  for (const table of billTables) {
    await addTable(page, language, table)
  }
  await page.goto("/", { waitUntil: "domcontentloaded" })

  // Intro: from the app root (numpad home), switch into POS/tables mode and
  // start a new bill from there — same steps as fixtures.ts's
  // startNewBill(), just smooth-clicked and captioned instead of instant.
  // The reload above re-inits Evolu's OPFS SQLite WASM, which can take a
  // while — wait for the screen to actually be ready *before* starting the
  // first caption, so the trim point lines up with what's visible instead
  // of with when we started waiting.
  const posButton = page.getByRole("button", {
    name: translate(language, "nav.pos"),
  })
  await posButton.waitFor()

  await withCaption(timeline, "Přepněte do POS režimu", () =>
    smoothClick(page, posButton)
  )
  await withCaption(timeline, "Založte nový účet", () =>
    smoothClick(
      page,
      page.getByTestId("no-table-tile").getByRole("link", {
        name: translate(language, "tables.tile.newBill"),
      })
    )
  )
  await page
    .getByRole("heading", { name: translate(language, "bill.title") })
    .waitFor()

  await withCaption(timeline, "Přidejte položky do účtu", async () => {
    for (const item of billCart) {
      const addButton = page.getByRole("button", {
        name: nameParam("bill.brick.add.aria", item.name),
      })
      for (let count = 0; count < item.quantity; count += 1) {
        await smoothClick(page, addButton)
      }
    }
  })

  await expect
    .poll(() => new URL(page.url()).searchParams.get("billId"))
    .not.toBeNull()

  await withCaption(timeline, "Otevřete souhrn účtu", () =>
    smoothClick(page, page.getByTestId("bill-summary-trigger"))
  )
  await page.getByTestId("bill-summary-panel").waitFor()
  await page.waitForTimeout(500)

  // Outro: pay the bill, pass through the tip step, flip between payment
  // methods, then mark the cash payment as received.
  await withCaption(timeline, "Přejděte k platbě", () =>
    smoothClick(
      page,
      page.getByRole("button", { name: translate(language, "home.pay") })
    )
  )

  const ibanTab = page.getByRole("tab", {
    name: translate(language, "paymentWait.method.iban"),
  })
  const cashTab = page.getByRole("tab", {
    name: translate(language, "paymentWait.method.cash"),
  })
  await selectPercentageTip(page, timeline, ibanTab, 10)

  await withCaption(timeline, "Zobrazte platbu přes IBAN", () =>
    smoothClick(page, ibanTab)
  )
  await withCaption(timeline, "Vraťte se na platbu hotově", () =>
    smoothClick(page, cashTab)
  )

  await withCaption(timeline, "Označte platbu jako zaplacenou", () =>
    smoothClick(
      page,
      page.getByRole("button", {
        name: translate(language, "paymentWait.cashPaid.action"),
      })
    )
  )
  await page
    .getByTestId("payment-paid-panel")
    .getByText(translate(language, "paymentWait.paid"))
    .waitFor()
  await page.waitForTimeout(1500)
}

const scenarios: ReadonlyArray<VideoScenario> = [
  { name: "payment", capture: capturePayment },
  { name: "bill", capture: captureBill },
]

async function saveCapture(
  name: VideoScenario["name"],
  video: Video,
  timeline: CaptionTimeline
): Promise<void> {
  const capturedPath = await video.path()
  const finalVideoPath = `${rawVideosDirectory}/${name}.webm`
  await rm(finalVideoPath, { force: true })
  await rename(capturedPath, finalVideoPath)

  const captionsFile: CaptionTimelineFile = {
    durationMs: timeline.elapsedMs(),
    cues: timeline.cues,
  }
  await writeFile(
    `${rawVideosDirectory}/${name}.captions.json`,
    JSON.stringify(captionsFile, null, 2)
  )
  console.info(`Captured ${finalVideoPath} (${captionsFile.durationMs}ms)`)
}

async function captureScenario(
  browser: Browser,
  scenario: VideoScenario
): Promise<void> {
  const context = await browser.newContext({
    baseURL: appUrl,
    colorScheme: "dark",
    locale: "cs-CZ",
    timezoneId: "Europe/Prague",
    viewport: { width: pageWidth, height: pageHeight },
    recordVideo: {
      dir: rawVideosDirectory,
      size: { width: pageWidth, height: pageHeight },
    },
  })

  const page = await context.newPage()
  const video = page.video()
  if (video === null) throw new Error("recordVideo did not produce a video.")

  // Recording starts the moment the page is created, so the timeline's zero
  // point has to match that, not whenever the first captioned step runs.
  const timeline = createCaptionTimeline(Date.now())
  await installFakeCursor(page)

  try {
    await scenario.capture(page, timeline)
  } finally {
    await context.close()
  }

  await saveCapture(scenario.name, video, timeline)
}

const requestedScenarioNames = process.env.PAYKY_VIDEO_SCENARIOS?.split(",")
  .map((name) => name.trim())
  .filter((name) => name !== "")

const selectedScenarios =
  requestedScenarioNames === undefined
    ? scenarios
    : scenarios.filter((scenario) =>
        requestedScenarioNames.includes(scenario.name)
      )

if (selectedScenarios.length === 0) {
  throw new Error(
    `No video scenario matched: ${requestedScenarioNames?.join(", ") ?? ""}.`
  )
}

async function run(): Promise<void> {
  await mkdir(rawVideosDirectory, { recursive: true })

  const server = spawn(
    "bun",
    [
      "run",
      "dev",
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      "4174",
      "--strictPort",
    ],
    {
      cwd: projectRoot,
      env: { ...process.env, PAYKY_DISABLE_BASIC_SSL: "1" },
      stdio: "ignore",
    }
  )

  try {
    await waitForApp()
    const browser = await chromium.launch()

    try {
      for (const scenario of selectedScenarios) {
        console.info(`Recording ${language} video scenario: ${scenario.name}`)
        await captureScenario(browser, scenario)
      }
    } finally {
      await browser.close()
    }
  } finally {
    server.kill()
    if (server.exitCode === null) {
      await new Promise<void>((resolve) => {
        server.once("exit", () => resolve())
      })
    }
  }
}

await run()
