import { Link } from "@tanstack/react-router"
import {
  ArrowRightIcon,
  BanknoteIcon,
  CheckIcon,
  ChevronDownIcon,
  LanguagesIcon,
  type LucideIcon,
  QrCodeIcon,
  ZapIcon,
} from "lucide-react"
import { type ReactNode, useState } from "react"
import { buttonVariants } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import { getPreferredDeviceLanguage } from "@/core/modules/device/device-utils.ts"
import { resources, type TranslationKey } from "@/i18n/resources.ts"
import { cn } from "@/lib/utils.ts"
import homeMockup from "../../../docs/mockup/home.webp"
import paidMockup from "../../../docs/mockup/paid.webp"
import paymentMockup from "../../../docs/mockup/payment.webp"

type LandingLanguage = "cs" | "en" | "sk"

const landingLanguageStorageKey = "payky.landingLanguage"

function isLandingLanguage(value: string | null): value is LandingLanguage {
  return value === "cs" || value === "en" || value === "sk"
}

function getInitialLandingLanguage(): LandingLanguage {
  const stored = localStorage.getItem(landingLanguageStorageKey)

  if (isLandingLanguage(stored)) {
    return stored
  }

  return getPreferredDeviceLanguage(navigator.language)
}

interface MethodCard {
  readonly icon: LucideIcon
  readonly title: TranslationKey
  readonly body: TranslationKey
  readonly iconClassName: string
}

interface FaqItem {
  readonly question: TranslationKey
  readonly answer: TranslationKey
}

interface LandingBenefitProps {
  readonly children: ReactNode
}

interface LanguageOption {
  readonly value: LandingLanguage
  readonly label: TranslationKey
}

const languageOptions: ReadonlyArray<LanguageOption> = [
  { value: "cs", label: "landing.language.czech" },
  { value: "en", label: "landing.language.english" },
  { value: "sk", label: "landing.language.slovak" },
]

const languageShortLabelKeys: Record<LandingLanguage, TranslationKey> = {
  cs: "landing.language.czech.short",
  en: "landing.language.english.short",
  sk: "landing.language.slovak.short",
}

const methodHighlights: ReadonlyArray<TranslationKey> = [
  "landing.methods.highlight.noSignup",
  "landing.methods.highlight.noContract",
  "landing.methods.highlight.noHardware",
  "landing.methods.highlight.noFees",
]

const methodCards: ReadonlyArray<MethodCard> = [
  {
    icon: QrCodeIcon,
    title: "landing.methods.qr.title",
    body: "landing.methods.qr.body",
    iconClassName: "text-primary",
  },
  {
    icon: BanknoteIcon,
    title: "landing.methods.cash.title",
    body: "landing.methods.cash.body",
    iconClassName: "text-primary",
  },
  {
    icon: ZapIcon,
    title: "landing.methods.lightning.title",
    body: "landing.methods.lightning.body",
    iconClassName: "text-warning",
  },
]

const faqItems: ReadonlyArray<FaqItem> = [
  {
    question: "landing.faq.cost.question",
    answer: "landing.faq.cost.answer",
  },
  {
    question: "landing.faq.terminal.question",
    answer: "landing.faq.terminal.answer",
  },
  {
    question: "landing.faq.data.question",
    answer: "landing.faq.data.answer",
  },
  {
    question: "landing.faq.backup.question",
    answer: "landing.faq.backup.answer",
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
    question: "landing.faq.community.question",
    answer: "landing.faq.community.answer",
  },
]

export function LandingPage() {
  const [language, setLanguage] = useState<LandingLanguage>(
    getInitialLandingLanguage
  )
  const [openFaq, setOpenFaq] = useState<TranslationKey | null>(null)
  const t = (key: TranslationKey) => resources[language][key]

  const handleLanguageChange = (nextLanguage: LandingLanguage | null) => {
    if (nextLanguage !== null) {
      setLanguage(nextLanguage)
      localStorage.setItem(landingLanguageStorageKey, nextLanguage)
    }
  }

  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-5 sm:gap-6 lg:px-8">
          <Link
            to="/landing"
            className="inline-flex shrink-0 items-center gap-2 text-xl font-extrabold tracking-tight"
            aria-label={t("app.name")}
          >
            <img src="/pwa-icon.svg" alt="" className="size-9 shrink-0" />
            <span>{t("app.name")}</span>
          </Link>

          <nav
            className="ml-auto hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex"
            aria-label={t("landing.navigation.label")}
          >
            <a
              className="transition-colors hover:text-foreground"
              href="#payments"
            >
              {t("landing.navigation.payments")}
            </a>
            <a
              className="transition-colors hover:text-foreground"
              href="#your-data"
            >
              {t("landing.navigation.data")}
            </a>
            <a
              className="transition-colors hover:text-foreground"
              href="#community"
            >
              {t("landing.navigation.community")}
            </a>
            <a className="transition-colors hover:text-foreground" href="#faq">
              {t("landing.navigation.faq")}
            </a>
          </nav>

          <div className="ml-auto flex items-center gap-3 md:ml-0">
            <Select<LandingLanguage>
              value={language}
              onValueChange={handleLanguageChange}
            >
              <SelectTrigger
                aria-label={t("landing.language.label")}
                size="sm"
                className="gap-1.5 border-none bg-transparent px-2 text-muted-foreground shadow-none hover:bg-muted hover:text-foreground data-[popup-open]:bg-muted"
              >
                <LanguagesIcon aria-hidden="true" className="size-4" />
                <SelectValue>
                  {(value: LandingLanguage) => t(languageShortLabelKeys[value])}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                {languageOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Link
              to="/"
              className={cn(
                buttonVariants({ size: "lg" }),
                "hidden h-10 px-5 sm:inline-flex"
              )}
            >
              {t("landing.navigation.open")}
            </Link>
          </div>
        </div>
      </header>

      <section className="overflow-hidden bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-6 pt-16 lg:grid-cols-2 lg:px-8 lg:pt-18">
          <div className="flex flex-col gap-6 pb-16 lg:pb-18">
            <div className="inline-flex self-start items-center gap-2 rounded-full bg-success/10 px-3.5 py-1.5 text-sm font-semibold text-success">
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-success"
              />
              {t("landing.hero.badge")}
            </div>
            <h1 className="max-w-2xl text-5xl font-extrabold tracking-tight text-balance sm:text-6xl">
              {t("landing.hero.title")}
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              {t("landing.hero.body")}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                to="/"
                className={cn(buttonVariants({ size: "lg" }), "h-12 px-7")}
              >
                {t("landing.hero.open")}
              </Link>
              <a
                href="https://github.com/finitoapp/payky/releases"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "h-12 px-7"
                )}
              >
                {t("landing.hero.download")}
              </a>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("landing.hero.note")}
            </p>
          </div>

          <img
            src={homeMockup}
            alt={t("landing.mockup.home.alt")}
            className="mx-auto w-full max-w-sm drop-shadow-2xl"
          />
        </div>
      </section>

      <section id="payments" className="scroll-mt-6 bg-muted/70">
        <div className="mx-auto max-w-7xl px-6 py-22 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-4xl font-extrabold tracking-tight text-balance">
              {t("landing.methods.title")}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              {t("landing.methods.body")}
            </p>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
              {methodHighlights.map((highlight) => (
                <span
                  key={highlight}
                  className="inline-flex items-center gap-2"
                >
                  <CheckIcon
                    aria-hidden="true"
                    className="size-4 text-success"
                  />
                  {t(highlight)}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {methodCards.map((method) => {
              const Icon = method.icon

              return (
                <Card key={method.title} className="min-h-full">
                  <CardHeader className="gap-3">
                    <Icon
                      aria-hidden="true"
                      className={cn("size-8", method.iconClassName)}
                    />
                    <CardTitle>{t(method.title)}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{t(method.body)}</CardDescription>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      <section id="your-data" className="scroll-mt-6">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-22 lg:grid-cols-2 lg:gap-16 lg:px-8">
          <div className="grid grid-cols-2 place-items-center gap-4 sm:gap-6">
            <img
              src={paymentMockup}
              alt={t("landing.mockup.payment.alt")}
              className="w-full max-w-xs drop-shadow-xl"
            />
            <img
              src={paidMockup}
              alt={t("landing.mockup.paid.alt")}
              className="w-full max-w-xs drop-shadow-xl"
            />
          </div>

          <div className="flex flex-col gap-5">
            <h2 className="text-4xl font-extrabold tracking-tight text-balance">
              {t("landing.data.title")}
            </h2>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {t("landing.data.body")}
            </p>
            <ul className="mt-2 flex flex-col gap-3.5 text-base">
              <LandingBenefit>{t("landing.data.offline")}</LandingBenefit>
              <LandingBenefit>{t("landing.data.private")}</LandingBenefit>
              <LandingBenefit>{t("landing.data.backup")}</LandingBenefit>
            </ul>
          </div>
        </div>
      </section>

      <section
        id="community"
        className="scroll-mt-6 bg-invert text-invert-foreground"
      >
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
          <div className="grid gap-14 lg:grid-cols-2 lg:gap-16">
            <article className="flex flex-col gap-4">
              <p className="text-sm font-bold tracking-[0.12em] text-success uppercase">
                {t("landing.openSource.label")}
              </p>
              <h2 className="text-4xl font-extrabold tracking-tight text-balance">
                {t("landing.openSource.title")}
              </h2>
              <p className="max-w-xl text-lg leading-relaxed text-invert-foreground/70">
                {t("landing.openSource.body")}
              </p>
              <a
                href="https://github.com/finitoapp/payky"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "mt-2 w-fit text-foreground"
                )}
              >
                {t("landing.openSource.link")}
                <ArrowRightIcon data-icon="inline-end" />
              </a>
              <div className="mt-1 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
                <a
                  href="https://github.com/finitoapp/payky/discussions"
                  className="inline-flex items-center gap-1.5 text-invert-foreground/70 transition-colors hover:text-invert-foreground"
                >
                  {t("landing.openSource.discussionsLink")}
                  <ArrowRightIcon
                    aria-hidden="true"
                    data-icon="inline-end"
                    className="size-4"
                  />
                </a>
                <a
                  href="https://signal.group/#CjQKIG6htHfJxD15ue8bEu0uiIM9HZux-Na1TfwTFOv8iepLEhAM0yHv8qkvPC5FC9JhuTEs"
                  className="inline-flex items-center gap-1.5 text-invert-foreground/70 transition-colors hover:text-invert-foreground"
                >
                  {t("landing.openSource.signalLink")}
                  <ArrowRightIcon
                    aria-hidden="true"
                    data-icon="inline-end"
                    className="size-4"
                  />
                </a>
              </div>
            </article>

            <article className="flex flex-col gap-4">
              <p className="text-sm font-bold tracking-[0.12em] text-success uppercase">
                {t("landing.price.label")}
              </p>
              <h2 className="text-4xl font-extrabold tracking-tight text-balance">
                {t("landing.price.title")}
              </h2>
              <p className="max-w-xl text-lg leading-relaxed text-invert-foreground/70">
                {t("landing.price.body")}
              </p>
            </article>
          </div>

          <div className="mt-14 border-t border-invert-foreground/10 pt-14">
            <p className="text-sm font-bold tracking-[0.12em] text-success uppercase">
              {t("landing.roadmap.label")}
            </p>
            <h3 className="mt-3 max-w-2xl text-2xl font-extrabold tracking-tight text-balance sm:text-3xl">
              {t("landing.roadmap.title")}
            </h3>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-invert-foreground/70">
              {t("landing.roadmap.body")}
            </p>
            <a
              href="https://github.com/finitoapp/payky/discussions"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "mt-5 w-fit text-foreground"
              )}
            >
              {t("landing.roadmap.cta")}
              <ArrowRightIcon data-icon="inline-end" />
            </a>
          </div>
        </div>
      </section>

      <section id="faq" className="scroll-mt-6">
        <div className="mx-auto max-w-7xl px-6 py-22 lg:px-8">
          <div className="max-w-3xl">
            <h2 className="text-4xl font-extrabold tracking-tight text-balance">
              {t("landing.faq.title")}
            </h2>
            <div className="mt-8">
              {faqItems.map((item) => {
                const isOpen = openFaq === item.question

                return (
                  <Collapsible
                    key={item.question}
                    className="border-b border-border"
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
                          "size-5 shrink-0 text-primary transition-transform",
                          isOpen && "rotate-180"
                        )}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pb-5 leading-relaxed text-muted-foreground">
                      {t(item.answer)}
                    </CollapsibleContent>
                  </Collapsible>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-4 px-6 py-7 text-sm text-muted-foreground md:flex-row md:items-center lg:px-8">
          <div className="inline-flex items-center gap-2 font-bold text-foreground">
            <img src="/pwa-icon.svg" alt="" className="size-6 shrink-0" />
            <span>{t("app.name")}</span>
          </div>
          <span>{t("landing.footer.description")}</span>
          <div className="flex gap-4 md:ml-auto">
            <a
              className="transition-colors hover:text-foreground"
              href="https://github.com/finitoapp/payky"
            >
              {t("landing.footer.github")}
            </a>
            <a
              className="transition-colors hover:text-foreground"
              href="https://github.com/finitoapp/payky/discussions"
            >
              {t("landing.footer.discussions")}
            </a>
            <a
              className="transition-colors hover:text-foreground"
              href="https://signal.group/#CjQKIG6htHfJxD15ue8bEu0uiIM9HZux-Na1TfwTFOv8iepLEhAM0yHv8qkvPC5FC9JhuTEs"
            >
              {t("landing.footer.signal")}
            </a>
            <a
              className="transition-colors hover:text-foreground"
              href="https://payky.me"
            >
              {t("landing.footer.website")}
            </a>
          </div>
        </div>
      </footer>
    </main>
  )
}

function LandingBenefit({ children }: LandingBenefitProps) {
  return (
    <li className="flex items-baseline gap-3">
      <span aria-hidden="true" className="size-2 rounded-full bg-success" />
      <span>{children}</span>
    </li>
  )
}
