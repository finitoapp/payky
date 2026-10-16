import { readFileSync } from "node:fs"
import {
  landingEetPaths,
  landingPaths,
  landingTechPaths,
} from "@payky/web-shared/landing-redirect"
import { describe, expect, test } from "vitest"
import appConfig from "../../web-app/vercel.json"
import landingConfig from "../vercel.json"
import {
  landingDocuments,
  landingFileName,
  landingLanguages,
} from "./landing-server.tsx"

const paths = {
  home: landingPaths,
  eet: landingEetPaths,
  tech: landingTechPaths,
}

describe("landing deployment", () => {
  test("serves every prerendered language and document at its existing address", () => {
    for (const document of landingDocuments) {
      for (const language of landingLanguages) {
        expect(landingConfig.rewrites).toContainEqual({
          source: paths[document][language],
          destination: `/${landingFileName(document, language)}`,
        })
      }
    }
  })

  test("proxies landing pages, assets and sitemap before the app fallback", () => {
    const fallback = appConfig.rewrites.findIndex(
      (route) => route.destination === "/index.html"
    )
    for (const source of ["/landing", "/landing/:path*", "/sitemap.xml"]) {
      const index = appConfig.rewrites.findIndex(
        (route) => route.source === source
      )
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(fallback)
      expect(appConfig.rewrites[index]?.destination).toMatch(/^https:\/\//)
    }
    expect(landingConfig.rewrites.at(-1)).toEqual({
      source: "/landing/:path*",
      destination: "/:path*",
    })
  })

  test("installs the existing app from the public origin", () => {
    const template = readFileSync(
      new URL("../landing.html", import.meta.url),
      "utf8"
    )
    expect(template).toContain('href="/manifest.webmanifest" data-vite-ignore')
    expect(template).toContain('href="/pwa-icon.svg" data-vite-ignore')
    expect(template).not.toContain('href="/landing/manifest.webmanifest"')
  })

  test.each([
    ["edge.payky.me", "payky-landing-edge"],
    ["payky-edge.vercel.app", "payky-landing-edge"],
    ["payky-edge-josef-ks-projects.vercel.app", "payky-landing-edge"],
    ["payky-edge-git-main-josef-ks-projects.vercel.app", "payky-landing-edge"],
    ["payky-edge-epz6asvwq-josef-ks-projects.vercel.app", "payky-landing-edge"],
    ["payky.me", "payky-landing"],
    ["payky-app.vercel.app", "payky-landing"],
    ["payky-josef-ks-projects.vercel.app", "payky-landing"],
    ["payky-git-production-josef-ks-projects.vercel.app", "payky-landing"],
  ])("pairs %s with %s", (host, upstream) => {
    for (const source of ["/landing", "/landing/:path*", "/sitemap.xml"]) {
      const route = appConfig.rewrites.find(
        (candidate) =>
          candidate.source === source &&
          (!candidate.has ||
            candidate.has.every(
              (condition) =>
                condition.type === "host" &&
                new RegExp(`^(?:${condition.value})$`, "u").test(host)
            ))
      )
      expect(route?.destination).toBe(`https://${upstream}.vercel.app${source}`)
    }
  })
})
