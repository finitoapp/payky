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
        "@type": "Organization",
        sameAs: ["https://github.com/finitoapp/payky"],
      }),
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

  test("shows the FAQ answers its structured data names", () => {
    const document = renderLandingDocument(template, "cs")
    const body = document.slice(document.indexOf("<body>"))

    expect(body).toContain(resources.cs["landing.faq.money.answer"])
  })

  test("links the other languages' pages from the page itself", () => {
    const body = renderLandingDocument(template, "en").split("<body>")[1]

    expect(body).toContain(`href="/landing" hrefLang="cs"`)
    expect(body).toContain(`href="/landing/sk" hrefLang="sk"`)
  })

  test("titles each page for search results with its own copy", () => {
    const document = renderLandingDocument(template, "cs")

    expect(document).toContain(
      `<title>${resources.cs["landing.meta.title"]}</title>`
    )
    expect(document).toContain(
      `<meta name="description" content="${resources.cs["landing.meta.description"]}"/>`
    )
  })

  test("offers a native and a web-based way into the app", () => {
    const document = renderLandingDocument(template, "en")

    for (const key of [
      "landing.closing.get.native.title",
      "landing.closing.get.native.action",
      "landing.closing.get.webBased.title",
      "landing.closing.get.webBased.action",
    ] as const) {
      expect(document).toContain(resources.en[key])
    }
  })
})
