import { useMediaQuery } from "@dedalik/use-react"
import { useEffect, useRef, useState } from "react"

import {
  type MockupScreen,
  mockupsByLanguage,
} from "@/features/landing/landing-mockups.ts"
import { Glow, Reveal } from "@/features/landing/landing-parts.tsx"
import { useLandingTranslation } from "@/features/landing/landing-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { cn } from "@/lib/utils.ts"

interface Feature {
  readonly screen: MockupScreen
  readonly title: TranslationKey
  readonly body: TranslationKey
}

const features: ReadonlyArray<Feature> = [
  {
    screen: "home",
    title: "landing.features.amount.title",
    body: "landing.features.amount.body",
  },
  {
    screen: "payment",
    title: "landing.features.scan.title",
    body: "landing.features.scan.body",
  },
  {
    screen: "paid",
    title: "landing.features.received.title",
    body: "landing.features.received.body",
  },
]

const mockupAltKeys = {
  home: "landing.mockup.home.alt",
  payment: "landing.mockup.payment.alt",
  paid: "landing.mockup.paid.alt",
} satisfies Record<MockupScreen, TranslationKey>

const stepNumber = (index: number) => String(index + 1).padStart(2, "0")

function FeatureText({
  feature,
  index,
}: {
  readonly feature: Feature
  readonly index: number
}) {
  const { t } = useLandingTranslation()
  return (
    <div className="flex max-w-lg flex-col gap-4">
      <p className="font-mono text-sm font-semibold text-(--landing-ink)">
        {stepNumber(index)}
      </p>
      <h3 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
        {t(feature.title)}
      </h3>
      <p className="text-lg leading-relaxed text-pretty text-muted-foreground">
        {t(feature.body)}
      </p>
    </div>
  )
}

function PhoneScreen({
  screen,
  className,
}: {
  readonly screen: MockupScreen
  readonly className?: string
}) {
  const { language, t } = useLandingTranslation()
  return (
    <img
      src={mockupsByLanguage[language][screen]}
      alt={t(mockupAltKeys[screen])}
      className={cn("w-full drop-shadow-2xl", className)}
      loading="lazy"
    />
  )
}

/** Tracks which step crosses the middle of the viewport. */
function useActiveStep() {
  const steps = useRef<Array<HTMLDivElement | null>>([])
  const [active, setActive] = useState(0)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(steps.current.indexOf(entry.target as HTMLDivElement))
          }
        }
      },
      { rootMargin: "-50% 0px -50% 0px" }
    )
    for (const step of steps.current) {
      if (step !== null) observer.observe(step)
    }
    return () => observer.disconnect()
  }, [])

  return { steps, active }
}

/** Wide screens: the text scrolls past a phone that stays and changes screen. */
function StickyStory() {
  const { steps, active } = useActiveStep()

  return (
    <div className="grid grid-cols-2 items-start gap-16">
      <div>
        {features.map((feature, index) => (
          <div
            key={feature.screen}
            ref={(element) => {
              steps.current[index] = element
            }}
            className={cn("landing-step", index === active && "is-active")}
          >
            <FeatureText feature={feature} index={index} />
          </div>
        ))}
      </div>
      <div className="self-stretch">
        <div className="landing-sticky">
          <div className="relative mx-auto flex max-w-sm items-center justify-center gap-6">
            <Glow size="140%" top="50%" left="50%" />
            <div className="relative aspect-[1164/2044] w-full">
              {features.map((feature, index) => (
                <div
                  key={feature.screen}
                  className={cn(
                    "landing-screen",
                    index === active && "is-active"
                  )}
                >
                  <PhoneScreen screen={feature.screen} />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2" aria-hidden="true">
              {features.map((feature, index) => (
                <span
                  key={feature.screen}
                  className={cn(
                    "w-1 rounded-full transition-all duration-500",
                    index === active ? "h-10 bg-primary" : "h-4 bg-border"
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Narrow screens: each step with its own phone, revealed as it arrives. */
function StackedStory() {
  return (
    <div className="flex flex-col gap-20">
      {features.map((feature, index) => (
        <Reveal key={feature.screen}>
          <div className="flex flex-col gap-10">
            <FeatureText feature={feature} index={index} />
            <div className="relative mx-auto w-full max-w-xs">
              <Glow size="120%" top="50%" left="50%" />
              <PhoneScreen screen={feature.screen} className="relative" />
            </div>
          </div>
        </Reveal>
      ))}
    </div>
  )
}

export function LandingFeatureStory() {
  const { t } = useLandingTranslation()
  // Narrow until hydrated, as the prerendered page is (landing/0002).
  const wide = useMediaQuery("(min-width: 64rem)", {
    initializeWithValue: false,
  })

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <Reveal>
        <h2 className="text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
          {t("landing.features.title")}
        </h2>
      </Reveal>
      <div className={wide ? "mt-4" : "mt-14"}>
        {wide ? <StickyStory /> : <StackedStory />}
      </div>
    </section>
  )
}
