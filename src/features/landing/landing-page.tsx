import {
  BanknoteIcon,
  ChevronDownIcon,
  CodeIcon,
  DatabaseIcon,
  EyeOffIcon,
  FileXIcon,
  LockIcon,
  type LucideIcon,
  ReceiptTextIcon,
  WifiOffIcon,
  ZapIcon,
} from "lucide-react"
import { useMemo, useState } from "react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx"
import { getPreferredDeviceLanguage } from "@/core/modules/device/device-utils.ts"
import { LandingClosing } from "@/features/landing/landing-closing.tsx"
import { LandingFeatureStory } from "@/features/landing/landing-feature-story.tsx"
import { LandingHeader } from "@/features/landing/landing-header.tsx"
import { LandingHero } from "@/features/landing/landing-hero.tsx"
import { Reveal } from "@/features/landing/landing-parts.tsx"
import {
  LandingLanguageSchema,
  type LandingTranslation,
  LandingTranslationContext,
  landingLanguageStorageKey,
  useLandingTranslation,
} from "@/features/landing/landing-translation.ts"
import { useLocalStorageState } from "@/hooks/use-local-storage-state.ts"
import {
  type Language,
  resources,
  type TranslationKey,
} from "@/i18n/resources.ts"
import { cn } from "@/lib/utils.ts"
import "@/features/landing/landing.css"

interface IconItem {
  readonly icon: LucideIcon
  readonly title: TranslationKey
  readonly body: TranslationKey
}

interface UseCaseCard {
  readonly image: string
  readonly title: TranslationKey
  readonly body: TranslationKey
  readonly alt: TranslationKey
}

interface FaqItem {
  readonly question: TranslationKey
  readonly answer: TranslationKey
}

const notNeeded: ReadonlyArray<LucideIcon> = [FileXIcon, LockIcon, EyeOffIcon]

const moreItems: ReadonlyArray<IconItem> = [
  {
    icon: WifiOffIcon,
    title: "landing.more.offline.title",
    body: "landing.more.offline.body",
  },
  {
    icon: DatabaseIcon,
    title: "landing.more.data.title",
    body: "landing.more.data.body",
  },
  {
    icon: ReceiptTextIcon,
    title: "landing.more.eet.title",
    body: "landing.more.eet.body",
  },
  {
    icon: BanknoteIcon,
    title: "landing.more.cash.title",
    body: "landing.more.cash.body",
  },
  {
    icon: ZapIcon,
    title: "landing.more.bitcoin.title",
    body: "landing.more.bitcoin.body",
  },
  {
    icon: CodeIcon,
    title: "landing.more.free.title",
    body: "landing.more.free.body",
  },
]

const useCaseCards: ReadonlyArray<UseCaseCard> = [
  {
    image: "/landing/bistro.webp",
    title: "landing.useCases.cafes.title",
    body: "landing.useCases.cafes.body",
    alt: "landing.useCases.cafes.alt",
  },
  {
    image: "/landing/seller.webp",
    title: "landing.useCases.shops.title",
    body: "landing.useCases.shops.body",
    alt: "landing.useCases.shops.alt",
  },
  {
    image: "/landing/service.webp",
    title: "landing.useCases.salons.title",
    body: "landing.useCases.salons.body",
    alt: "landing.useCases.salons.alt",
  },
  {
    image: "/landing/craftsman.webp",
    title: "landing.useCases.craftsmen.title",
    body: "landing.useCases.craftsmen.body",
    alt: "landing.useCases.craftsmen.alt",
  },
]

const faqItems: ReadonlyArray<FaqItem> = [
  {
    question: "landing.faq.catch.question",
    answer: "landing.faq.catch.answer",
  },
  {
    question: "landing.faq.money.question",
    answer: "landing.faq.money.answer",
  },
  {
    question: "landing.faq.eet.question",
    answer: "landing.faq.eet.answer",
  },
  {
    question: "landing.faq.terminal.question",
    answer: "landing.faq.terminal.answer",
  },
]

const signalGroupUrl =
  "https://signal.group/#CjQKIG6htHfJxD15ue8bEu0uiIM9HZux-Na1TfwTFOv8iepLEhAM0yHv8qkvPC5FC9JhuTEs"

/** What a merchant does not need, as a one-line statement between the stories. */
function NotNeeded() {
  const { t } = useLandingTranslation()
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
      <Reveal>
        <div className="flex flex-col items-center gap-7 text-center">
          <div
            className="flex gap-7"
            role="img"
            aria-label={t("landing.noNeed.alt")}
          >
            {notNeeded.map((Icon) => (
              <Icon
                key={Icon.displayName}
                aria-hidden="true"
                className="size-8 text-(--landing-ink)"
                strokeWidth={1.75}
              />
            ))}
          </div>
          <h2 className="max-w-3xl text-3xl font-bold tracking-tight text-balance whitespace-pre-line sm:text-4xl lg:text-5xl">
            {t("landing.noNeed.title")}
          </h2>
        </div>
      </Reveal>
    </section>
  )
}

function More() {
  const { t } = useLandingTranslation()
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <Reveal>
        <h2 className="text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
          {t("landing.more.title")}
        </h2>
      </Reveal>
      <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {moreItems.map((item) => {
          const Icon = item.icon
          return (
            <Reveal key={item.title}>
              <article className="flex flex-col gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-(--landing-ink)">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <h3 className="text-xl font-semibold tracking-tight">
                  {t(item.title)}
                </h3>
                <p className="leading-relaxed text-pretty text-muted-foreground">
                  {t(item.body)}
                </p>
              </article>
            </Reveal>
          )
        })}
      </div>
    </section>
  )
}

function UseCases() {
  const { t } = useLandingTranslation()
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <Reveal>
        <h2 className="text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
          {t("landing.useCases.title")}
        </h2>
      </Reveal>
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {useCaseCards.map((useCase) => (
          <Reveal key={useCase.title}>
            <article className="flex flex-col gap-3">
              <img
                src={useCase.image}
                alt={t(useCase.alt)}
                className="aspect-4/3 w-full rounded-2xl object-cover"
                loading="lazy"
              />
              <h3 className="text-lg font-semibold tracking-tight">
                {t(useCase.title)}
              </h3>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                {t(useCase.body)}
              </p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function Faq() {
  const { t } = useLandingTranslation()
  const [openFaq, setOpenFaq] = useState<TranslationKey | null>(null)

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <Reveal>
        <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
          <h2 className="text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
            {t("landing.faq.title")}
          </h2>
          <div className="flex flex-col gap-3">
            {faqItems.map((item) => {
              const isOpen = openFaq === item.question
              return (
                <Collapsible
                  key={item.question}
                  className="rounded-2xl bg-card px-5 shadow-sm"
                  open={isOpen}
                  onOpenChange={(nextOpen) => {
                    setOpenFaq(nextOpen ? item.question : null)
                  }}
                >
                  <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 py-5 text-left text-lg font-semibold">
                    <span>{t(item.question)}</span>
                    <ChevronDownIcon
                      aria-hidden="true"
                      className={cn(
                        "size-5 shrink-0 text-(--landing-ink) transition-transform",
                        isOpen && "rotate-180"
                      )}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pb-5 leading-relaxed text-pretty whitespace-pre-line text-muted-foreground">
                    {t(item.answer)}
                  </CollapsibleContent>
                </Collapsible>
              )
            })}
          </div>
        </div>
      </Reveal>
    </section>
  )
}

function FooterLink({
  href,
  children,
}: {
  readonly href: string
  readonly children: string
}) {
  return (
    <a
      className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      href={href}
    >
      {children}
    </a>
  )
}

function Footer() {
  const { t } = useLandingTranslation()
  return (
    <footer className="bg-muted/50">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-center lg:px-8">
        <div className="inline-flex items-center gap-2 text-base font-bold tracking-tight">
          <img src="/pwa-icon.svg" alt="" className="size-6 shrink-0" />
          <span>{t("app.name")}</span>
        </div>
        <span className="text-sm text-muted-foreground">
          {t("landing.footer.description")}
        </span>
        <div className="flex flex-wrap gap-5 md:ml-auto">
          <FooterLink href="https://github.com/finitoapp/payky">
            {t("landing.footer.github")}
          </FooterLink>
          <FooterLink href="https://github.com/finitoapp/payky/discussions">
            {t("landing.footer.discussions")}
          </FooterLink>
          <FooterLink href={signalGroupUrl}>
            {t("landing.footer.signal")}
          </FooterLink>
          <FooterLink href="https://payky.me">
            {t("landing.footer.website")}
          </FooterLink>
        </div>
      </div>
    </footer>
  )
}

export function LandingPage() {
  const [preferredLanguage] = useState(() =>
    getPreferredDeviceLanguage(navigator.language)
  )
  const [language, setLanguage] = useLocalStorageState<Language>(
    landingLanguageStorageKey,
    preferredLanguage,
    LandingLanguageSchema
  )
  const translation = useMemo<LandingTranslation>(
    () => ({
      language,
      setLanguage,
      t: (key) => resources[language][key],
    }),
    [language, setLanguage]
  )

  return (
    <LandingTranslationContext.Provider value={translation}>
      <div className="landing min-h-svh bg-background text-foreground">
        <LandingHeader />
        <main>
          <LandingHero />
          <LandingFeatureStory />
          <NotNeeded />
          <More />
          <UseCases />
          <Faq />
          <LandingClosing />
        </main>
        <Footer />
      </div>
    </LandingTranslationContext.Provider>
  )
}
