import { describe, expect, test } from "vitest"
import { resources } from "@/i18n/resources.ts"
import { renderLandingDocument } from "@/landing-server.tsx"

const template = `<!doctype html><html lang="cs"><head><!--landing-head--></head><body><div id="root"><!--landing-app--></div></body></html>`

describe("renderLandingDocument", () => {
  test.each([
    ["cs", "https://payky.me/landing"],
    ["en", "https://payky.me/landing/en"],
    ["sk", "https://payky.me/landing/sk"],
  ] as const)(
    "prerenders the page in %s at its own address",
    (language, url) => {
      const document = renderLandingDocument(template, language)

      expect(document).toContain(`<html lang="${language}"`)
      expect(document).toContain(`<link rel="canonical" href="${url}"/>`)
      expect(document).toContain(resources[language]["landing.faq.title"])
      expect(document).not.toContain("<!--landing-app-->")
    }
  )

  test("links every language's page to the others", () => {
    const document = renderLandingDocument(template, "cs")

    expect(document).toContain(
      `<link rel="alternate" hrefLang="en" href="https://payky.me/landing/en"/>`
    )
    expect(document).toContain(
      `<link rel="alternate" hrefLang="sk" href="https://payky.me/landing/sk"/>`
    )
    expect(document).toContain(
      `<link rel="alternate" hrefLang="x-default" href="https://payky.me/landing"/>`
    )
  })

  test("describes the app and the page's FAQ for search results", () => {
    const document = renderLandingDocument(template, "sk")
    const json = document.match(
      /<script type="application\/ld\+json">(.*?)<\/script>/su
    )?.[1]
    const data: unknown = JSON.parse(json ?? "null")

    expect(data).toEqual([
      expect.objectContaining({
        "@type": "SoftwareApplication",
        offers: expect.objectContaining({ price: "0" }),
      }),
      expect.objectContaining({
        "@type": "FAQPage",
        mainEntity: expect.arrayContaining([
          expect.objectContaining({
            name: resources.sk["landing.faq.money.question"],
          }),
        ]),
      }),
    ])
    expect(document).toContain(
      `<meta property="og:image" content="https://payky.me/landing/og-cs.png"/>`
    )
  })
})
