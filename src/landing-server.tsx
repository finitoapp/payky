import type { ReactNode } from "react"
import { renderToStaticMarkup, renderToString } from "react-dom/server"

import { apkUrl, zapstoreUrl } from "@/features/landing/landing-closing.tsx"
import {
  eetFaqItems,
  LandingEetPage,
} from "@/features/landing/landing-eet-page.tsx"
import {
  type FaqItem,
  faqItems,
  githubUrl,
  LandingPage,
} from "@/features/landing/landing-page.tsx"
import {
  landingEetPaths,
  landingPaths,
} from "@/features/shared/landing-redirect.ts"
import {
  type Language,
  resources,
  type TranslationKey,
} from "@/i18n/resources.ts"

const siteUrl = "https://payky.me"

export const landingLanguages = Object.keys(landingPaths) as ReadonlyArray<
  keyof typeof landingPaths
>

/** The prerendered landing documents: the home page and the EET 2.0 page. */
export type LandingDocument = "home" | "eet"

export const landingDocuments: ReadonlyArray<LandingDocument> = ["home", "eet"]

/** The file each document is written to, which `vercel.json` serves. */
export const landingFileName = (
  document: LandingDocument,
  language: Language
): string =>
  document === "home"
    ? `landing-${language}.html`
    : `landing-${document}-${language}.html`

const documentPaths = {
  home: landingPaths,
  eet: landingEetPaths,
} satisfies Record<LandingDocument, Record<Language, string>>

const documentMeta = {
  home: {
    title: "landing.meta.title",
    description: "landing.meta.description",
  },
  eet: {
    title: "landing.eet.meta.title",
    description: "landing.eet.meta.description",
  },
} satisfies Record<
  LandingDocument,
  { readonly title: TranslationKey; readonly description: TranslationKey }
>

const pageUrl = (document: LandingDocument, language: Language) =>
  `${siteUrl}${documentPaths[document][language]}`

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

const faqStructuredData = (
  language: Language,
  items: ReadonlyArray<FaqItem>
) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  inLanguage: language,
  mainEntity: items.map((item) => ({
    "@type": "Question",
    name: resources[language][item.question],
    acceptedAnswer: {
      "@type": "Answer",
      text: resources[language][item.answer],
    },
  })),
})

/**
 * Structured data for search results: who makes Payky, the app with its
 * price and downloads, and the page's FAQ, whose answers the page shows too.
 * The EET page describes only its own FAQ.
 */
function structuredData(document: LandingDocument, language: Language): string {
  const t = resources[language]
  const data =
    document === "eet"
      ? [faqStructuredData(language, eetFaqItems)]
      : [
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: t["app.name"],
            url: pageUrl("home", language),
            logo: `${siteUrl}/pwa-icon-512.png`,
            sameAs: [githubUrl],
          },
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: t["app.name"],
            description: t["landing.meta.description"],
            url: pageUrl("home", language),
            image: `${siteUrl}${ogImages[language]}`,
            applicationCategory: "FinanceApplication",
            operatingSystem: "Android, Web",
            downloadUrl: apkUrl,
            installUrl: zapstoreUrl,
            inLanguage: language,
            offers: { "@type": "Offer", price: "0", priceCurrency: "CZK" },
          },
          faqStructuredData(language, faqItems),
        ]
  // Inside a <script>, so nothing in the copy may close it.
  return JSON.stringify(data).replaceAll("<", "\\u003c")
}

/** What a crawler and a link preview read before any script runs. */
function LandingHead({
  document,
  language,
}: {
  readonly document: LandingDocument
  readonly language: Language
}) {
  const t = resources[language]
  const title = t[documentMeta[document].title]
  const description = t[documentMeta[document].description]

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={pageUrl(document, language)} />
      {landingLanguages.map((alternate) => (
        <link
          key={alternate}
          rel="alternate"
          hrefLang={alternate}
          href={pageUrl(document, alternate)}
        />
      ))}
      <link
        rel="alternate"
        hrefLang="x-default"
        href={pageUrl(document, "cs")}
      />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={t["app.name"]} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={pageUrl(document, language)} />
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
        dangerouslySetInnerHTML={{ __html: structuredData(document, language) }}
      />
    </>
  )
}

const documentPages = {
  home: LandingPage,
  eet: LandingEetPage,
} satisfies Record<
  LandingDocument,
  (props: { readonly language: Language }) => ReactNode
>

/**
 * Fills the built `landing.html` with `document` in `language` (landing/0002,
 * landing/0006): `bin/prerender-landing.ts` writes one file per document and
 * language from it.
 */
export function renderLandingDocument(
  template: string,
  language: Language,
  document: LandingDocument = "home"
): string {
  const Page = documentPages[document]
  return template
    .replace(/<html lang="[^"]*"/u, `<html lang="${language}"`)
    .replace(
      "<!--landing-head-->",
      renderToStaticMarkup(
        <LandingHead document={document} language={language} />
      )
    )
    .replace("<!--landing-app-->", renderToString(<Page language={language} />))
}
