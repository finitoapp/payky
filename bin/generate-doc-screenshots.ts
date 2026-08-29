import { Buffer } from "node:buffer"
import { spawn } from "node:child_process"
import { mkdir, rm } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium, expect, type Page } from "@playwright/test"
import sharp from "sharp"
import {
  addCatalogItem,
  addTable,
  completeOnboarding,
  createPayment,
  enterAmount,
  gotoPosOverview,
  markCashPaid,
  pageHeight,
  pageWidth,
  startNewBill,
  translate,
} from "../e2e/fixtures.ts"
import {
  type Language,
  resources,
  type TranslationKey,
} from "../src/i18n/resources.ts"
import {
  contentBottomInset,
  contentTopInset,
  deviceScaleFactor,
  frameHeight,
  frameScreenCornerRadius,
  frameScreenHeight,
  frameScreenLeft,
  frameScreenTop,
  frameScreenWidth,
  frameWidth,
  outputWidth,
} from "./phone-frame-geometry.ts"

interface ScreenshotScenario {
  readonly name: "home" | "payment" | "paid" | "settings" | "bill" | "tables"
  readonly capture: (page: Page, language: Language) => Promise<void>
}

const documentationLanguages = Object.keys(resources) as Language[]

const localeByLanguage: Record<Language, string> = {
  en: "en-US",
  cs: "cs-CZ",
  sk: "sk-SK",
}

const capturedWidth = pageWidth * deviceScaleFactor
const capturedHeight = pageHeight * deviceScaleFactor
const appScreenshotHeight = Math.round(
  (capturedHeight / capturedWidth) * outputWidth
)
const outputHeight = contentTopInset + appScreenshotHeight + contentBottomInset
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const rawScreenshotsDirectory = `${projectRoot}/.tmp/docs-screenshots`
const screenshotsDirectory = `${projectRoot}/docs/screenshots`
const mockupsDirectory = `${projectRoot}/docs/mockup`
const framePath = `${mockupsDirectory}/phone-frame.svg`
const appUrl = "http://127.0.0.1:4173"

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

function createFrameScreenMask(): Buffer {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${frameScreenWidth}" height="${frameScreenHeight}" viewBox="0 0 ${frameScreenWidth} ${frameScreenHeight}">
      <rect width="${frameScreenWidth}" height="${frameScreenHeight}" rx="${frameScreenCornerRadius}" fill="#ffffff"/>
    </svg>
  `)
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

  throw new Error("Timed out waiting for the documentation screenshot server.")
}

function nameParam(
  language: Language,
  key: TranslationKey,
  name: string
): string {
  return translate(language, key).replace("{name}", name)
}

interface CatalogItem {
  readonly name: string
  readonly price: string
}

interface CartItem extends CatalogItem {
  readonly quantity: number
}

/**
 * A fuller-looking catalog grid for the bill screenshot. Only the first
 * two items are actually added to the cart (2x and 1x, see
 * `billCartByLanguage`); the rest just fill out the grid.
 */
const billCatalogByLanguage: Record<Language, ReadonlyArray<CatalogItem>> = {
  en: [
    { name: "Coffee", price: "4.5" },
    { name: "Croissant", price: "3.25" },
    { name: "Sandwich", price: "6" },
    { name: "Orange Juice", price: "3.5" },
    { name: "Bagel", price: "4" },
    { name: "Iced Tea", price: "3.75" },
  ],
  cs: [
    { name: "Káva", price: "65" },
    { name: "Croissant", price: "55" },
    { name: "Sendvič", price: "89" },
    { name: "Pomerančový džus", price: "45" },
    { name: "Bagel", price: "60" },
    { name: "Ledový čaj", price: "55" },
  ],
  sk: [
    { name: "Káva", price: "2.5" },
    { name: "Croissant", price: "2" },
    { name: "Sendvič", price: "3.5" },
    { name: "Pomarančový džús", price: "1.8" },
    { name: "Bagel", price: "2.2" },
    { name: "Ľadový čaj", price: "2" },
  ],
}

const billCartByLanguage: Record<Language, ReadonlyArray<CartItem>> = {
  en: [
    { name: "Coffee", price: "4.5", quantity: 2 },
    { name: "Croissant", price: "3.25", quantity: 1 },
  ],
  cs: [
    { name: "Káva", price: "65", quantity: 2 },
    { name: "Croissant", price: "55", quantity: 1 },
  ],
  sk: [
    { name: "Káva", price: "2.5", quantity: 2 },
    { name: "Croissant", price: "2", quantity: 1 },
  ],
}

const tableNamesByLanguage: Record<
  Language,
  readonly [string, string, string, string, string, string]
> = {
  en: ["Table 1", "Table 2", "Table 3", "Table 4", "Table 5", "Table 6"],
  cs: ["Stůl 1", "Stůl 2", "Stůl 3", "Stůl 4", "Stůl 5", "Stůl 6"],
  sk: ["Stôl 1", "Stôl 2", "Stôl 3", "Stôl 4", "Stôl 5", "Stôl 6"],
}

const tablesCartItemByLanguage: Record<Language, CartItem> = {
  en: { name: "Coffee", price: "4.5", quantity: 1 },
  cs: { name: "Káva", price: "65", quantity: 1 },
  sk: { name: "Káva", price: "2.5", quantity: 1 },
}

async function capturePage(
  page: Page,
  name: ScreenshotScenario["name"],
  language: Language
): Promise<void> {
  await page.screenshot({
    path: `${rawScreenshotsDirectory}/${language}/${name}.png`,
  })
}

const scenarios: ReadonlyArray<ScreenshotScenario> = [
  {
    name: "home",
    async capture(page, language) {
      await completeOnboarding(page, language, { baseURL: appUrl })
      await enterAmount(page, language)
      await capturePage(page, "home", language)
    },
  },
  {
    name: "payment",
    async capture(page, language) {
      await completeOnboarding(page, language, { baseURL: appUrl })
      await createPayment(page, language)
      await page
        .getByRole("tab", {
          name: translate(language, "paymentWait.method.iban"),
        })
        .click()
      await expect(
        page.getByRole("button", {
          name: translate(language, "paymentWait.copyQr"),
        })
      ).toBeEnabled()
      await capturePage(page, "payment", language)
    },
  },
  {
    name: "paid",
    async capture(page, language) {
      await completeOnboarding(page, language, { baseURL: appUrl })
      await createPayment(page, language)
      await markCashPaid(page, language)
      await page.waitForTimeout(350)
      await capturePage(page, "paid", language)
    },
  },
  {
    name: "settings",
    async capture(page, language) {
      await completeOnboarding(page, language, { baseURL: appUrl })
      await page
        .getByRole("button", { name: translate(language, "settings.title") })
        .click()
      await page
        .getByRole("heading", { name: translate(language, "settings.title") })
        .waitFor()
      await capturePage(page, "settings", language)
    },
  },
  {
    name: "bill",
    async capture(page, language) {
      await completeOnboarding(page, language, { baseURL: appUrl })
      for (const item of billCatalogByLanguage[language]) {
        await addCatalogItem(page, language, item)
      }
      const cartItems = billCartByLanguage[language]

      await page.goto("/", { waitUntil: "domcontentloaded" })
      await startNewBill(page, language)

      for (const item of cartItems) {
        const addButton = page.getByRole("button", {
          name: nameParam(language, "bill.brick.add.aria", item.name),
        })
        for (let count = 0; count < item.quantity; count += 1) {
          await addButton.click()
        }
      }

      await expect
        .poll(() => new URL(page.url()).searchParams.get("billId"))
        .not.toBeNull()

      await page.getByTestId("bill-summary-trigger").click()
      await page.getByTestId("bill-summary-panel").waitFor()
      // The summary panel's expand/collapse is a 300ms CSS transition
      // (grid-template-rows), not a mount/unmount `waitFor()` can catch.
      await page.waitForTimeout(400)
      await capturePage(page, "bill", language)
    },
  },
  {
    name: "tables",
    async capture(page, language) {
      await completeOnboarding(page, language, { baseURL: appUrl })
      const tableNames = tableNamesByLanguage[language]
      for (const name of tableNames) {
        await addTable(page, language, { name, seatCount: "4" })
      }
      const cartItem = tablesCartItemByLanguage[language]
      await addCatalogItem(page, language, {
        name: cartItem.name,
        price: cartItem.price,
      })

      await gotoPosOverview(page, language)

      const parkCartOnTable = async (tableName: string) => {
        await page
          .getByTestId("no-table-tile")
          .getByRole("link", {
            name: translate(language, "tables.tile.newBill"),
          })
          .click()
        await page
          .getByRole("heading", { name: translate(language, "bill.title") })
          .waitFor()
        await page
          .getByRole("button", {
            name: translate(language, "bill.table.aria"),
          })
          .click()
        const dialog = page.getByRole("dialog", {
          name: translate(language, "bill.table.dialog.title"),
        })
        await dialog.getByRole("button", { name: tableName }).click()
        await expect(dialog).not.toBeVisible()
        await page
          .getByRole("button", {
            name: nameParam(language, "bill.brick.add.aria", cartItem.name),
          })
          .click()
        await expect
          .poll(() => new URL(page.url()).searchParams.get("billId"))
          .not.toBeNull()
        await page
          .getByRole("button", { name: translate(language, "nav.back") })
          .click()
        await page.getByTestId("no-table-tile").waitFor()
      }

      const [firstTable, secondTable] = tableNames
      await parkCartOnTable(firstTable)
      await parkCartOnTable(secondTable)
      await parkCartOnTable(secondTable)

      // Prefix shared by every bill row's accessible name (e.g. "Bill #"),
      // distinct enough from the tile's "new bill" link not to match it.
      const billLabelPrefix = translate(language, "bill.list.label").split(
        "{number}"
      )[0]

      await expect(
        page
          .getByTestId("table-tile")
          .filter({ hasText: secondTable })
          .getByRole("link", { name: billLabelPrefix })
      ).toHaveCount(2)
      await capturePage(page, "tables", language)
    },
  },
]

const requestedScenarioNames = process.env.PAYKY_SCREENSHOT_SCENARIOS?.split(
  ","
)
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
    `No screenshot scenario matched: ${requestedScenarioNames?.join(", ") ?? ""}.`
  )
}

async function composeScreenshot(
  name: ScreenshotScenario["name"],
  language: Language
): Promise<void> {
  const rawPath = `${rawScreenshotsDirectory}/${language}/${name}.png`
  const screenshotPath = `${screenshotsDirectory}/${language}/${name}.png`
  const mockupPath = `${mockupsDirectory}/${language}/${name}.webp`
  const raw = await sharp(rawPath).metadata()

  if (raw.width !== capturedWidth || raw.height !== capturedHeight) {
    throw new Error(
      `Expected ${name} to be ${capturedWidth}x${capturedHeight}, received ${raw.width}x${raw.height}.`
    )
  }

  const appScreenshot = await sharp(rawPath)
    .resize({ width: outputWidth })
    .toBuffer()

  const phoneScreenshot = await sharp({
    create: {
      width: outputWidth,
      height: outputHeight,
      channels: 4,
      background: "#101314",
    },
  })
    .composite([
      {
        input: appScreenshot,
        top: contentTopInset,
        left: 0,
      },
    ])
    .png()
    .toBuffer()

  await rm(`${screenshotsDirectory}/${language}/${name}.jpg`, { force: true })

  await sharp(phoneScreenshot).png().toFile(screenshotPath)

  const frameScreenshot = await sharp(phoneScreenshot)
    .resize({
      width: frameScreenWidth,
      height: frameScreenHeight,
      fit: "cover",
      position: "centre",
    })
    .toBuffer()

  const clippedFrameScreenshot = await sharp(frameScreenshot)
    .ensureAlpha()
    .composite([{ input: createFrameScreenMask(), blend: "dest-in" }])
    .png()
    .toBuffer()

  await sharp({
    create: {
      width: frameWidth,
      height: frameHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: clippedFrameScreenshot,
        top: frameScreenTop,
        left: frameScreenLeft,
      },
      { input: framePath, top: 0, left: 0 },
    ])
    .webp({ lossless: true })
    .toFile(mockupPath)
}

async function run(): Promise<void> {
  await rm(rawScreenshotsDirectory, { recursive: true, force: true })
  await Promise.all([
    mkdir(rawScreenshotsDirectory, { recursive: true }),
    mkdir(screenshotsDirectory, { recursive: true }),
    mkdir(mockupsDirectory, { recursive: true }),
  ])

  const server = spawn(
    "bun",
    [
      "run",
      "dev",
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      "4173",
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
      for (const language of documentationLanguages) {
        await Promise.all([
          mkdir(`${rawScreenshotsDirectory}/${language}`, { recursive: true }),
          mkdir(`${screenshotsDirectory}/${language}`, { recursive: true }),
          mkdir(`${mockupsDirectory}/${language}`, { recursive: true }),
        ])

        for (const scenario of selectedScenarios) {
          console.info(
            `Generating ${language} documentation screenshot: ${scenario.name}`
          )
          const context = await browser.newContext({
            baseURL: appUrl,
            colorScheme: "dark",
            deviceScaleFactor,
            locale: localeByLanguage[language],
            reducedMotion: "reduce",
            timezoneId: "Europe/Prague",
            viewport: { width: pageWidth, height: pageHeight },
          })
          const page = await context.newPage()

          try {
            await scenario.capture(page, language)
          } finally {
            await context.close()
          }

          await composeScreenshot(scenario.name, language)
        }
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
    await rm(rawScreenshotsDirectory, { recursive: true, force: true })
  }
}

await run()
