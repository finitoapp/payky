import { type CSSProperties, type ReactNode, useState } from "react"

import { useIntersectionObserver } from "@/hooks/use-intersection-observer.ts"
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

/** A spark of accent light travelling from one percent position to another. */
export function Pulse({
  from,
  to,
  delay,
  duration,
}: {
  readonly from: Point
  readonly to: Point
  readonly delay: number
  readonly duration?: number
}) {
  const style: CSSProperties & Record<`--${string}`, string> = {
    "--from-x": percent(from.x),
    "--from-y": percent(from.y),
    "--to-x": percent(to.x),
    "--to-y": percent(to.y),
    animationDelay: `${delay}s`,
    animationDuration: duration === undefined ? undefined : `${duration}s`,
  }
  return <div aria-hidden="true" className="landing-pulse" style={style} />
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
