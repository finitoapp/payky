import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { requiredPermission } from "../../../core/route-access.ts"

const read = (file: string) =>
  readFileSync(new URL(file, import.meta.url), "utf8")
const page = read("./privacy-settings-page.tsx")
const hook = read("./use-privacy-settings.ts")
const controller = read("../../../components/sentry-controller.tsx")
const reporting = read("../../../core/error-reporting.ts")

it("keeps the privacy page free, like web's device consents", () => {
  expect(requiredPermission("/settings/about/privacy")).toBeNull()
})

it("flips errorReportingEnabled on the device row and lets the controller react", () => {
  expect(hook).toContain(
    "errorReportingEnabled: enabled ? sqliteTrue : sqliteFalse"
  )
  expect(hook).toContain("updateDeviceSettings(deviceEvolu")
  expect(page).toContain("settings.setErrorReportingEnabled(!reporting)")
  // The page never touches the SDK; the controller starts and closes it.
  expect(page).not.toMatch(/error-reporting|Sentry/u)
  expect(controller).toContain("enableErrorReporting()")
  expect(controller).toContain("disableErrorReporting()")
  expect(reporting).toContain("void Sentry.close()")
})
