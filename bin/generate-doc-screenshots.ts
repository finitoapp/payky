import { Buffer } from "node:buffer"
import { spawn } from "node:child_process"
import { mkdir, rm } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium, expect, type Page } from "@playwright/test"
import sharp from "sharp"
import {
  type Language,
  resources,
  type TranslationKey,
} from "../src/i18n/resources.ts"

interface ScreenshotScenario {
  readonly name: "home" | "payment" | "paid" | "settings"
  readonly capture: (page: Page, language: Language) => Promise<void>
}

const documentationLanguages = Object.keys(resources) as Language[]

const languageOptionKeyByLanguage: Record<Language, TranslationKey> = {
  en: "settings.language.english.title",
  cs: "settings.language.czech.title",
  sk: "settings.language.slovak.title",
}

const localeByLanguage: Record<Language, string> = {
  en: "en-US",
  cs: "cs-CZ",
  sk: "sk-SK",
}

const pageWidth = 406
const pageHeight = 818
const deviceScaleFactor = 3.5
const capturedWidth = pageWidth * deviceScaleFactor
const capturedHeight = pageHeight * deviceScaleFactor
const outputWidth = 1260
const contentTopInset = Math.round(60 * deviceScaleFactor)
const contentBottomInset = Math.round(38 * deviceScaleFactor)
const appScreenshotHeight = Math.round(
  (capturedHeight / capturedWidth) * outputWidth
)
const outputHeight = contentTopInset + appScreenshotHeight + contentBottomInset
const frameWidth = 1164
const frameHeight = 2044
const frameScreenLeft = 202
const frameScreenTop = 201
const frameScreenWidth = 760
const frameScreenHeight = 1629
const frameScreenCornerRadius = 80
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

function translate(language: Language, key: TranslationKey): string {
  return resources[language][key]
}

async function completeOnboarding(
  page: Page,
  language: Language
): Promise<void> {
  await page.goto(appUrl, { waitUntil: "domcontentloaded" })
  await page
    .getByRole("heading", { name: translate(language, "onboarding.title") })
    .waitFor()
  await page
    .getByRole("button", {
      name: translate(language, languageOptionKeyByLanguage[language]),
    })
    .click()
  await page
    .getByRole("button", { name: translate(language, "onboarding.next") })
    .click()
  await page
    .getByRole("button", {
      name: translate(language, "onboarding.accountChoice.new.title"),
    })
    .click()
  await page
    .getByRole("button", { name: translate(language, "onboarding.next") })
    .click()
  await page
    .getByRole("button", { name: translate(language, "onboarding.next") })
    .click()
  await page
    .getByRole("checkbox", {
      name: translate(language, "onboarding.payments.btc.title"),
    })
    .click()
  await page
    .getByRole("checkbox", {
      name: translate(language, "onboarding.payments.iban.title"),
    })
    .click()
  await page.getByRole("textbox").fill("CZ6508000000192000145399")
  await page
    .getByRole("button", { name: translate(language, "onboarding.next") })
    .click()
  await page
    .getByRole("button", { name: translate(language, "onboarding.finish") })
    .click()
  await page
    .getByRole("button", { name: translate(language, "settings.title") })
    .waitFor()
}

async function enterAmount(page: Page, language: Language): Promise<void> {
  await page.getByRole("button", { name: "5", exact: true }).click()
  await page
    .getByRole("button", {
      name: translate(language, "home.keypad.decimal"),
    })
    .click()
  await page.getByRole("button", { name: "9", exact: true }).click()
}

async function createPayment(page: Page, language: Language): Promise<void> {
  await enterAmount(page, language)
  await page
    .getByRole("button", { name: translate(language, "home.pay") })
    .click()
  await page
    .getByRole("tab", {
      name: translate(language, "paymentWait.method.iban"),
    })
    .waitFor()
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
      await completeOnboarding(page, language)
      await enterAmount(page, language)
      await capturePage(page, "home", language)
    },
  },
  {
    name: "payment",
    async capture(page, language) {
      await completeOnboarding(page, language)
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
      await completeOnboarding(page, language)
      await createPayment(page, language)
      await page
        .getByRole("button", {
          name: translate(language, "paymentWait.cashPaid.action"),
        })
        .click()
      await page
        .locator('[aria-hidden="false"]')
        .getByText(translate(language, "paymentWait.paid"))
        .waitFor()
      await page.waitForTimeout(350)
      await capturePage(page, "paid", language)
    },
  },
  {
    name: "settings",
    async capture(page, language) {
      await completeOnboarding(page, language)
      await page
        .getByRole("button", { name: translate(language, "settings.title") })
        .click()
      await page
        .getByRole("heading", { name: translate(language, "settings.title") })
        .waitFor()
      await capturePage(page, "settings", language)
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
