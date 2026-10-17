/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"

/**
 * Both the web app and the native app import this package, so it must stay
 * free of either app and of any one platform. Tests are excluded: they run in
 * Node and may touch whatever they need.
 */

const srcDir = import.meta.dirname

const forbiddenImport =
  /^(?:.*\/)?apps\/|^@\/|^react-dom(?:\/|$)|^react-native(?:\/|$)|^expo(?:[-/]|$)|^@capacitor\/|^@tanstack\/react-router(?:\/|$)/u
const browserGlobal = /\b(?:window|document|navigator)\./u

const specifiers = (source: string): ReadonlyArray<string> =>
  [
    ...source.matchAll(
      /(?:\bfrom\s+|\bimport\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gmu
    ),
  ].flatMap((match) => (match[1] === undefined ? [] : [match[1]]))

const files = readdirSync(srcDir, { recursive: true })
  .map(String)
  .filter((file) => /\.tsx?$/u.test(file) && !/\.test\.tsx?$/u.test(file))

describe("app-shared boundaries", () => {
  test("imports no app or platform module", () => {
    const offenders = files.flatMap((file) =>
      specifiers(readFileSync(path.join(srcDir, file), "utf8"))
        .filter((specifier) => forbiddenImport.test(specifier))
        .map((specifier) => `${file} imports ${specifier}`)
    )
    expect(offenders).toEqual([])
  })

  test("uses no browser globals", () => {
    const offenders = files.filter((file) =>
      browserGlobal.test(readFileSync(path.join(srcDir, file), "utf8"))
    )
    expect(offenders).toEqual([])
  })
})
