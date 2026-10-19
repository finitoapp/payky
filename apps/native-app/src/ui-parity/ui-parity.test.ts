import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "vitest"
import { kitComponents, kitElements } from "./ui-parity"
import { uiParityMap } from "./ui-parity-map"

const repoRoot = path.resolve(import.meta.dirname, "../../../..")
const nativePath = (file: string) => `apps/native-app/${file}`

const isFeatureParitySource = (file: string): boolean => {
  const segments = file.split(/[\\/]/u)
  return (
    file.endsWith(".tsx") &&
    !file.endsWith(".test.tsx") &&
    !file.endsWith(".spec.tsx") &&
    segments[0] !== "preview" &&
    !segments.includes("__tests__")
  )
}

const featureParitySources = (): ReadonlyArray<string> =>
  readdirSync(path.join(repoRoot, "apps/native-app/src/features"), {
    recursive: true,
  })
    .map(String)
    .filter(isFeatureParitySource)
    .map((file) => `src/features/${file.split(/[\\/]/u).join("/")}`)
    .sort()

const kitSet = (file: string) =>
  kitComponents(file, readFileSync(path.join(repoRoot, file), "utf8"))

test("every mapped file exists", () => {
  const missing = uiParityMap
    .flatMap((entry) => [nativePath(entry.native), ...entry.web])
    .filter((file) => !existsSync(path.join(repoRoot, file)))
  expect(missing).toEqual([])
})

test("a native-only entry says why it has no web counterpart", () => {
  const unexplained = uiParityMap.filter(
    (entry) => entry.web.length === 0 && (entry.note ?? "").trim() === ""
  )
  expect(unexplained.map((entry) => entry.native)).toEqual([])
})

test("each native file is mapped once", () => {
  const natives = uiParityMap.map((entry) => entry.native)
  expect(natives.length).toBe(new Set(natives).size)
})

test("every parity entry is matched", () => {
  const pending = uiParityMap
    .filter((entry) => entry.status === "pending")
    .map((entry) => entry.native)
  expect(pending).toEqual([])
})

test("every native feature TSX source has a parity entry", () => {
  const mapped = new Set(uiParityMap.map((entry) => entry.native))
  const unmapped = featureParitySources().filter((file) => !mapped.has(file))
  expect(unmapped).toEqual([])
})

test("feature parity discovery includes helpers and excludes preview and test TSX", () => {
  const sources = [
    "settings/page.tsx",
    "settings/scan-code-button.tsx",
    "preview/native-preview-page.tsx",
    "settings/preview/banner.tsx",
    "settings/page.test.tsx",
    "settings/page.spec.tsx",
    "settings/__tests__/page.tsx",
    "settings/use-page.ts",
  ]
  expect(sources.filter(isFeatureParitySource)).toEqual([
    "settings/page.tsx",
    "settings/scan-code-button.tsx",
    "settings/preview/banner.tsx",
  ])
})

test("a matched screen renders the kit components its web files do", () => {
  const drift = uiParityMap
    .filter((entry) => entry.status === "matched")
    .flatMap((entry) => {
      const allowed = entry.allowedDifferences ?? {}
      const unexplained = Object.entries(allowed)
        .filter(([, reason]) => reason.trim() === "")
        .map(([name]) => `${entry.native}: ${name} has no reason`)
      const native = kitSet(nativePath(entry.native))
      const web = new Set(entry.web.flatMap((file) => [...kitSet(file)]))
      const missing = [...web]
        .filter((name) => !native.has(name) && !(name in allowed))
        .map((name) => `${entry.native}: missing ${name}`)
      const extra = [...native]
        .filter((name) => !web.has(name) && !(name in allowed))
        .map((name) => `${entry.native}: extra ${name}`)
      return [...unexplained, ...missing, ...extra]
    })
  expect(drift).toEqual([])
})

test("kitElements reads web kit imports and their props", () => {
  const source = `
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent as Content } from "@/components/ui/card.tsx"
import { FadeHeader } from "@/components/fade-header.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { Local } from "./local.tsx"

export function Page() {
  return (
    <div>
      <FadeHeader title={t("settings.title")} />
      <Card size="sm">
        <Content>
          <Button variant="outline" size="lg" disabled>Go</Button>
          <Local />
        </Content>
      </Card>
      <ThemeProvider />
    </div>
  )
}
`
  expect(
    kitElements("apps/web-app/src/features/settings/page.tsx", source)
  ).toEqual([
    {
      name: "FadeHeader",
      line: 11,
      depth: 0,
      props: { title: "t(settings.title)" },
    },
    { name: "Card", line: 12, depth: 0, props: { size: "sm" } },
    { name: "CardContent", line: 13, depth: 1, props: {} },
    {
      name: "Button",
      line: 14,
      depth: 2,
      props: { variant: "outline", size: "lg", disabled: "true" },
    },
  ])
})

test("kitComponents resolves native relative imports", () => {
  const source = `
import { Button } from "../../components/ui/button.tsx"
import { FadeHeader } from "../../components/fade-header.tsx"
import { Screen } from "../../components/screen.tsx"
import type { Props } from "../../components/ui/card.tsx"
import { Text, XStack } from "tamagui"

export function Page() {
  return (
    <Screen>
      <FadeHeader title="x" />
      <XStack><Text>Hi</Text><Button /></XStack>
    </Screen>
  )
}
`
  expect([
    ...kitComponents("apps/native-app/src/features/settings/page.tsx", source),
  ]).toEqual(["FadeHeader", "Button"])
})
