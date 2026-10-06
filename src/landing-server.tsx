import { renderToStaticMarkup, renderToString } from "react-dom/server"

import { faqItems, LandingPage } from "@/features/landing/landing-page.tsx"
import { landingPaths } from "@/features/shared/landing-redirect.ts"
import { type Language, resources } from "@/i18n/resources.ts"

const siteUrl = "https://payky.me"

export const landingLanguages = Object.keys(landingPaths) as ReadonlyArray<
  keyof typeof landingPaths
>

const pageUrl = (language: Language) => `${siteUrl}${landingPaths[language]}`

const ogLocales = {
  cs: "cs_CZ",
  en: "en_US",
  sk: "sk_SK",
} satisfies Record<Language, string>

// Made from the Twitter header, which has no Slovak version yet.
const ogImages = {
  cs: "/landing/og-cs.png",
  en: "/landing/og-en.png",
  sk: "/landing/og-cs.png",
} satisfies Record<Language, string>

/**
 * Structured data for search results: the app with its price, and the
 * page's FAQ, whose answers the page shows too.
 */
function structuredData(language: Language): string {
  const t = resources[language]
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: t["app.name"],
      description: t["landing.hero.subtitle"],
      url: pageUrl(language),
      image: `${siteUrl}${ogImages[language]}`,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Android, Web",
      inLanguage: language,
      offers: { "@type": "Offer", price: "0", priceCurrency: "CZK" },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: language,
      mainEntity: faqItems.map((item) => ({
        "@type": "Question",
        name: t[item.question],
        acceptedAnswer: { "@type": "Answer", text: t[item.answer] },
      })),
    },
  ]
  // Inside a <script>, so nothing in the copy may close it.
  return JSON.stringify(data).replaceAll("<", "\\u003c")
}

/** What a crawler and a link preview read before any script runs. */
function LandingHead({ language }: { readonly language: Language }) {
  const t = resources[language]
  const title = `${t["app.name"]} – ${t["landing.hero.title"]}`
  const description = t["landing.hero.subtitle"]

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={pageUrl(language)} />
      {landingLanguages.map((alternate) => (
        <link
          key={alternate}
          rel="alternate"
          hrefLang={alternate}
          href={pageUrl(alternate)}
        />
      ))}
      <link rel="alternate" hrefLang="x-default" href={pageUrl("en")} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={t["app.name"]} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={pageUrl(language)} />
      <meta property="og:locale" content={ogLocales[language]} />
      {landingLanguages
        .filter((alternate) => alternate !== language)
        .map((alternate) => (
          <meta
            key={alternate}
            property="og:locale:alternate"
            content={ogLocales[alternate]}
          />
        ))}
      <meta property="og:image" content={`${siteUrl}${ogImages[language]}`} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={title} />
      <meta name="twitter:card" content="summary_large_image" />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON built here, `<` escaped.
        dangerouslySetInnerHTML={{ __html: structuredData(language) }}
      />
    </>
  )
}

/**
 * Fills the built `landing.html` with the page in `language` (landing/0002):
 * `bin/prerender-landing.ts` writes one file per language from it.
 */
export function renderLandingDocument(
  template: string,
  language: Language
): string {
  return template
    .replace(/<html lang="[^"]*"/u, `<html lang="${language}"`)
    .replace(
      "<!--landing-head-->",
      renderToStaticMarkup(<LandingHead language={language} />)
    )
    .replace(
      "<!--landing-app-->",
      renderToString(<LandingPage language={language} />)
    )
}
