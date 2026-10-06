import { Link } from "@tanstack/react-router"
import {
  GlobeIcon,
  type LucideIcon,
  SmartphoneIcon,
  ZapIcon,
} from "lucide-react"
import { Suspense } from "react"

import { buttonVariants } from "@/components/ui/button.tsx"
import {
  LandingContactForm,
  LandingContactFormSkeleton,
} from "@/features/landing/landing-contact-form.tsx"
import { Reveal } from "@/features/landing/landing-parts.tsx"
import { useLandingTranslation } from "@/features/landing/landing-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { cn } from "@/lib/utils.ts"

const zapstoreUrl = "https://zapstore.dev/apps/me.payky"

interface GetOption {
  readonly id: "android" | "pwa"
  readonly icon: LucideIcon
  readonly title: TranslationKey
  readonly body: TranslationKey
  readonly action: TranslationKey
}

/** Android gets the app from Zapstore; everything else runs the web app. */
const getOptions: ReadonlyArray<GetOption> = [
  {
    id: "android",
    icon: SmartphoneIcon,
    title: "landing.closing.get.android.title",
    body: "landing.closing.get.android.body",
    action: "landing.closing.get.android.action",
  },
  {
    id: "pwa",
    icon: GlobeIcon,
    title: "landing.closing.get.pwa.title",
    body: "landing.closing.get.pwa.body",
    action: "landing.closing.get.pwa.action",
  },
]

const actionClassName = cn(
  buttonVariants({ size: "lg" }),
  "mt-auto h-11 w-fit rounded-full px-6 text-base font-semibold has-data-[icon=inline-start]:pl-5"
)

function GetOptionAction({ option }: { readonly option: GetOption }) {
  const { t } = useLandingTranslation()

  if (option.id === "android") {
    return (
      <a
        href={zapstoreUrl}
        className={actionClassName}
        target="_blank"
        rel="noopener noreferrer"
      >
        <ZapIcon aria-hidden="true" data-icon="inline-start" />
        {t(option.action)}
      </a>
    )
  }

  return (
    <Link to="/" className={actionClassName}>
      <GlobeIcon aria-hidden="true" data-icon="inline-start" />
      {t(option.action)}
    </Link>
  )
}

/** "We'll help you": the one thing the page asks for, a way to reach the sender. */
function HelpYou() {
  const { t } = useLandingTranslation()

  return (
    <article
      id="contact"
      className="grid scroll-mt-24 gap-8 rounded-3xl bg-card p-6 shadow-sm sm:p-10 lg:grid-cols-[2fr_3fr] lg:gap-14"
    >
      <div className="flex flex-col gap-4">
        <h2 className="text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
          {t("landing.closing.contact.title")}
        </h2>
        <p className="text-lg leading-relaxed text-pretty text-muted-foreground">
          {t("landing.closing.contact.body")}
        </p>
      </div>
      <Suspense fallback={<LandingContactFormSkeleton />}>
        <LandingContactForm />
      </Suspense>
    </article>
  )
}

/** "I'll manage on my own": the two ways in, side by side. */
function OnYourOwn() {
  const { t } = useLandingTranslation()

  return (
    <article
      id="download"
      className="flex scroll-mt-24 flex-col gap-8 rounded-3xl bg-muted/50 p-6 sm:p-10"
    >
      <div className="flex flex-col gap-3">
        <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t("landing.closing.get.title")}
        </h3>
        <p className="max-w-2xl leading-relaxed text-pretty text-muted-foreground">
          {t("landing.closing.get.body")}
        </p>
      </div>
      <ul className="grid gap-8 md:grid-cols-2 md:gap-10">
        {getOptions.map((option) => {
          const Icon = option.icon
          return (
            <li key={option.id} className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-background text-(--landing-ink)">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <h4 className="text-lg font-semibold">{t(option.title)}</h4>
              </div>
              <p className="leading-relaxed text-pretty text-muted-foreground">
                {t(option.body)}
              </p>
              <GetOptionAction option={option} />
            </li>
          )
        })}
      </ul>
    </article>
  )
}

export function LandingClosing() {
  return (
    <section
      id="get-started"
      className="mx-auto flex max-w-6xl scroll-mt-16 flex-col gap-6 px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
    >
      <Reveal>
        <HelpYou />
      </Reveal>
      <Reveal>
        <OnYourOwn />
      </Reveal>
    </section>
  )
}
