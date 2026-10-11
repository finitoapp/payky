import { useHash, useMediaQuery } from "@dedalik/use-react"
import {
  CalculatorIcon,
  type LucideIcon,
  ShoppingBasketIcon,
  UtensilsCrossedIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx"
import {
  type MockupScreen,
  mockupsByLanguage,
} from "@/features/landing/landing-mockups.ts"
import { Glow, Reveal } from "@/features/landing/landing-parts.tsx"
import { useLandingTranslation } from "@/features/landing/landing-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { cn } from "@/lib/utils.ts"

interface Step {
  readonly screen: MockupScreen
  readonly title: TranslationKey
  readonly body: TranslationKey
}

export type FlowId = "amount" | "bill" | "tables"

interface Flow {
  readonly id: FlowId
  readonly icon: LucideIcon
  readonly tab: TranslationKey
  readonly audience: TranslationKey
  readonly steps: ReadonlyArray<Step>
}

/** The three ways of selling, from a typed amount up to a floor of tables. */
const flows: ReadonlyArray<Flow> = [
  {
    id: "amount",
    icon: CalculatorIcon,
    tab: "landing.flows.amount.tab",
    audience: "landing.flows.amount.audience",
    steps: [
      {
        screen: "home",
        title: "landing.flows.amount.step1.title",
        body: "landing.flows.amount.step1.body",
      },
      {
        screen: "payment",
        title: "landing.flows.amount.step2.title",
        body: "landing.flows.amount.step2.body",
      },
      {
        screen: "paid",
        title: "landing.flows.amount.step3.title",
        body: "landing.flows.amount.step3.body",
      },
    ],
  },
  {
    id: "bill",
    icon: ShoppingBasketIcon,
    tab: "landing.flows.bill.tab",
    audience: "landing.flows.bill.audience",
    steps: [
      {
        screen: "items",
        title: "landing.flows.bill.step1.title",
        body: "landing.flows.bill.step1.body",
      },
      {
        screen: "bill",
        title: "landing.flows.bill.step2.title",
        body: "landing.flows.bill.step2.body",
      },
      {
        screen: "payment",
        title: "landing.flows.bill.step3.title",
        body: "landing.flows.bill.step3.body",
      },
    ],
  },
  {
    id: "tables",
    icon: UtensilsCrossedIcon,
    tab: "landing.flows.tables.tab",
    audience: "landing.flows.tables.audience",
    steps: [
      {
        screen: "tables",
        title: "landing.flows.tables.step1.title",
        body: "landing.flows.tables.step1.body",
      },
      {
        screen: "tableBill",
        title: "landing.flows.tables.step2.title",
        body: "landing.flows.tables.step2.body",
      },
      {
        screen: "split",
        title: "landing.flows.tables.step3.title",
        body: "landing.flows.tables.step3.body",
      },
      {
        screen: "paid",
        title: "landing.flows.tables.step4.title",
        body: "landing.flows.tables.step4.body",
      },
    ],
  },
]

/** The id of a flow's tab, so a link to `#flow-…` scrolls to it and opens it. */
export const flowAnchor = (flow: FlowId) => `flow-${flow}`

/** The statistics screen, its figures first and then its charts further down. */
const statsSteps: ReadonlyArray<Step> = [
  {
    screen: "stats",
    title: "landing.stats.overview.title",
    body: "landing.stats.overview.body",
  },
  {
    screen: "statsCharts",
    title: "landing.stats.charts.title",
    body: "landing.stats.charts.body",
  },
]

const mockupAltKeys = {
  bill: "landing.mockup.bill.alt",
  home: "landing.mockup.home.alt",
  items: "landing.mockup.items.alt",
  paid: "landing.mockup.paid.alt",
  payment: "landing.mockup.payment.alt",
  split: "landing.mockup.split.alt",
  stats: "landing.mockup.stats.alt",
  statsCharts: "landing.mockup.statsCharts.alt",
  tableBill: "landing.mockup.tableBill.alt",
  tables: "landing.mockup.tables.alt",
} satisfies Record<MockupScreen, TranslationKey>

const stepNumber = (index: number) => String(index + 1).padStart(2, "0")

function FeatureText({
  step,
  index,
  numbered,
}: {
  readonly step: Step
  readonly index: number
  readonly numbered: boolean
}) {
  const { t } = useLandingTranslation()
  return (
    <div className="flex max-w-lg flex-col gap-4">
      {numbered ? (
        <p className="font-mono text-sm font-semibold text-(--landing-ink)">
          {stepNumber(index)}
        </p>
      ) : null}
      <h3 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
        {t(step.title)}
      </h3>
      <p className="text-lg leading-relaxed text-pretty text-muted-foreground">
        {t(step.body)}
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
    <div className={cn("relative", className)}>
      <img
        src={mockupsByLanguage[language][screen]}
        alt={t(mockupAltKeys[screen])}
        className="w-full drop-shadow-2xl"
        loading="lazy"
      />
      {/* Ripples off the check of the paid screen, the same in every language. */}
      {screen === "paid" ? (
        <div
          aria-hidden="true"
          className="landing-check-ping absolute top-[37.8%] left-1/2 aspect-square w-[15.3%]"
        />
      ) : null}
    </div>
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
function StickyStory({
  steps,
  numbered,
}: {
  readonly steps: ReadonlyArray<Step>
  readonly numbered: boolean
}) {
  const { steps: stepElements, active } = useActiveStep()

  return (
    <div className="grid grid-cols-2 items-start gap-16">
      <div>
        {steps.map((step, index) => (
          <div
            key={step.screen}
            ref={(element) => {
              stepElements.current[index] = element
            }}
            className={cn("landing-step", index === active && "is-active")}
          >
            <FeatureText step={step} index={index} numbered={numbered} />
          </div>
        ))}
      </div>
      <div className="self-stretch">
        <div className="landing-sticky">
          <div className="relative mx-auto flex max-w-sm items-center justify-center gap-6">
            <Glow size="140%" top="50%" left="50%" />
            <div className="relative aspect-[1164/2044] w-full">
              {steps.map((step, index) => (
                <div
                  key={step.screen}
                  className={cn(
                    "landing-screen",
                    index === active && "is-active"
                  )}
                >
                  <PhoneScreen screen={step.screen} />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2" aria-hidden="true">
              {steps.map((step, index) => (
                <span
                  key={step.screen}
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
function StackedStory({
  steps,
  numbered,
}: {
  readonly steps: ReadonlyArray<Step>
  readonly numbered: boolean
}) {
  return (
    <div className="flex flex-col gap-20">
      {steps.map((step, index) => (
        <Reveal key={step.screen}>
          <div className="flex flex-col gap-10">
            <FeatureText step={step} index={index} numbered={numbered} />
            <div className="relative mx-auto w-full max-w-xs">
              <Glow size="120%" top="50%" left="50%" />
              <PhoneScreen screen={step.screen} className="relative" />
            </div>
          </div>
        </Reveal>
      ))}
    </div>
  )
}

/** Wide screens tell a story with a phone that stays; narrow ones stack it. */
function Story({
  steps,
  wide,
  numbered,
}: {
  readonly steps: ReadonlyArray<Step>
  readonly wide: boolean
  readonly numbered: boolean
}) {
  return wide ? (
    <StickyStory steps={steps} numbered={numbered} />
  ) : (
    <StackedStory steps={steps} numbered={numbered} />
  )
}

/** What the statistics show, whichever way the merchant sells. */
function StatsStory({ wide }: { readonly wide: boolean }) {
  const { t } = useLandingTranslation()
  return (
    <div className="mt-20 rounded-3xl bg-muted/40 px-6 py-10 sm:px-10 lg:mt-28 lg:px-14 lg:pt-14 lg:pb-0">
      <Reveal className="flex max-w-2xl flex-col gap-4">
        <h3 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          {t("landing.stats.title")}
        </h3>
        <p className="text-lg leading-relaxed text-pretty text-muted-foreground">
          {t("landing.stats.body")}
        </p>
      </Reveal>
      <div className={wide ? "mt-4" : "mt-12"}>
        <Story steps={statsSteps} wide={wide} numbered={false} />
      </div>
    </div>
  )
}

export function LandingFeatureStory() {
  const { t } = useLandingTranslation()
  // Narrow until hydrated, as the prerendered page is (landing/0002).
  const wide = useMediaQuery("(min-width: 64rem)", {
    initializeWithValue: false,
  })
  // The first flow until hydrated too; a `#flow-…` link then opens its own.
  const [active, setActive] = useState<FlowId>("amount")
  const [hash] = useHash()
  useEffect(() => {
    const linked = flows.find((flow) => hash === `#${flowAnchor(flow.id)}`)
    if (linked !== undefined) setActive(linked.id)
  }, [hash])

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <Reveal>
        <h2 className="text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
          {t("landing.flows.title")}
        </h2>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground">
          {t("landing.flows.subtitle")}
        </p>
      </Reveal>
      <Tabs
        className="mt-10 flex-col gap-0"
        value={active}
        onValueChange={(value) => {
          const next = flows.find((flow) => flow.id === value)
          if (next !== undefined) setActive(next.id)
        }}
      >
        <TabsList
          aria-label={t("landing.flows.label")}
          className="grid h-auto w-full grid-cols-3 rounded-2xl p-1 sm:w-fit"
        >
          {flows.map((flow) => {
            const Icon = flow.icon
            return (
              <TabsTrigger
                key={flow.id}
                id={flowAnchor(flow.id)}
                value={flow.id}
                className="scroll-mt-28 flex-col gap-1 rounded-xl px-3 py-2.5 text-sm whitespace-normal sm:flex-row sm:gap-2 sm:px-5 sm:text-base"
              >
                <Icon aria-hidden="true" />
                {t(flow.tab)}
              </TabsTrigger>
            )
          })}
        </TabsList>
        {flows.map((flow) => (
          // Every flow stays in the prerendered page, hidden until chosen.
          <TabsContent
            key={flow.id}
            value={flow.id}
            keepMounted
            className="text-base"
          >
            <p className="mt-6 font-mono text-sm font-semibold tracking-[0.12em] text-(--landing-ink) uppercase">
              {t(flow.audience)}
            </p>
            <div className={wide ? "mt-4" : "mt-10"}>
              <Story steps={flow.steps} wide={wide} numbered />
            </div>
          </TabsContent>
        ))}
      </Tabs>
      <StatsStory wide={wide} />
    </section>
  )
}
