import { useIntersectionObserver } from "@payky/web-shared/use-intersection-observer"
import type { LucideIcon } from "lucide-react"
import { type CSSProperties, type ReactNode, useState } from "react"
import { buttonVariants } from "@/components/ui/button.tsx"
import { useLandingTranslation } from "@/features/landing/landing-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { cn } from "@/lib/utils.ts"

export interface Point {
  readonly x: number
  readonly y: number
}

export const percent = (value: number) => `${value}%`

/** Turns true the first time the element scrolls into view, and stays so. */
export function useInViewOnce<T extends Element>() {
  const [visible, setVisible] = useState(false)
  const ref = useIntersectionObserver<T>(() => setVisible(true), {
    enabled: !visible,
    rootMargin: "-10% 0px",
  })
  return { ref, visible }
}

/** Fades its content in the first time it scrolls into view. */
export function Reveal({
  children,
  className,
}: {
  readonly children: ReactNode
  readonly className?: string
}) {
  const { ref, visible } = useInViewOnce<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className={cn("landing-reveal", visible && "is-visible", className)}
    >
      {children}
    </div>
  )
}

/** A soft pool of accent light behind the product. */
export function Glow({
  size,
  top,
  left,
}: {
  readonly size: string
  readonly top: string
  readonly left: string
}) {
  return (
    <div
      aria-hidden="true"
      className="landing-glow"
      style={{
        width: size,
        height: size,
        top,
        left,
        transform: "translate(-50%, -50%)",
      }}
    />
  )
}

/**
 * A spark of accent light travelling from one percent position to another,
 * or whatever `children` draw, such as a padlock (`landing-pulse-icon`).
 */
export function Pulse({
  from,
  to,
  via,
  delay,
  duration,
  className,
  children,
}: {
  readonly from: Point
  readonly to: Point
  /** The apex of an arc to travel along instead of the straight line; it bulges along one axis only. */
  readonly via?: Point
  readonly delay: number
  readonly duration?: number
  readonly className?: string
  readonly children?: ReactNode
}) {
  const style: CSSProperties & Record<`--${string}`, string> = {
    "--from-x": percent(from.x),
    "--from-y": percent(from.y),
    "--to-x": percent(to.x),
    "--to-y": percent(to.y),
    ...(via === undefined
      ? {}
      : { "--via-x": percent(via.x), "--via-y": percent(via.y) }),
    animationDelay: `${delay}s`,
    animationDuration: duration === undefined ? undefined : `${duration}s`,
  }
  return (
    <div
      aria-hidden="true"
      className={cn(
        "landing-pulse",
        via !== undefined &&
          (from.y === to.y ? "landing-pulse-arc-y" : "landing-pulse-arc-x"),
        className
      )}
      style={style}
    >
      {children}
    </div>
  )
}

/** Places a piece of a stage at percent offsets. */
export function Placed({
  children,
  className,
  ...placement
}: Pick<CSSProperties, "left" | "right" | "top" | "bottom" | "width"> & {
  readonly children: ReactNode
  readonly className?: string
}) {
  return (
    <div className={className} style={{ position: "absolute", ...placement }}>
      {children}
    </div>
  )
}

/** The eyebrow above a section title: a small accent label. */
export function Eyebrow({ children }: { readonly children: ReactNode }) {
  return (
    <p className="font-mono text-sm font-semibold tracking-[0.12em] text-(--landing-ink) uppercase">
      {children}
    </p>
  )
}

export const primaryActionClassName = cn(
  buttonVariants({ size: "lg" }),
  "h-12 rounded-full px-6 text-base font-semibold has-data-[icon=inline-start]:pl-5"
)

const sectionClassName = "mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24"

const titleClassName =
  "text-4xl font-extrabold tracking-tight text-balance sm:text-5xl"

export const bodyClassName =
  "text-lg leading-relaxed text-pretty text-muted-foreground"

/** A full-width band of a page, plain or muted to set it off. */
export function Band({
  id,
  muted = false,
  children,
}: {
  readonly id?: string
  readonly muted?: boolean
  readonly children: ReactNode
}) {
  return (
    <section id={id} className={cn("scroll-mt-16", muted && "bg-muted/40")}>
      <div className={sectionClassName}>{children}</div>
    </section>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  readonly eyebrow: TranslationKey
  readonly title: TranslationKey
  readonly body?: TranslationKey
}) {
  const { t } = useLandingTranslation()
  return (
    <Reveal className="flex max-w-3xl flex-col gap-4">
      <Eyebrow>{t(eyebrow)}</Eyebrow>
      <h2 className={titleClassName}>{t(title)}</h2>
      {body === undefined ? null : <p className={bodyClassName}>{t(body)}</p>}
    </Reveal>
  )
}

export interface IconCard {
  readonly icon: LucideIcon
  readonly title: TranslationKey
  readonly body: TranslationKey
  readonly link?: { readonly label: TranslationKey; readonly href: string }
}

export function IconGrid({
  items,
}: {
  readonly items: ReadonlyArray<IconCard>
}) {
  const { t } = useLandingTranslation()
  return (
    <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
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
              {item.link === undefined ? null : (
                <a
                  className="font-semibold text-(--landing-ink) hover:underline"
                  href={item.link.href}
                >
                  {t(item.link.label)}
                </a>
              )}
            </article>
          </Reveal>
        )
      })}
    </div>
  )
}
