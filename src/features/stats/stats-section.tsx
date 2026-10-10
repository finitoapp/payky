import type { ReactNode } from "react"

import {
  verticalNavShellClassName,
  verticalNavTitleClassName,
} from "@/components/vertical-nav.tsx"
import { cn } from "@/lib/utils.ts"

/** One block of the statistics screen: a titled card, an optional note under it. */
export function StatsSection({
  title,
  note,
  className,
  children,
}: {
  readonly title: string
  readonly note?: ReactNode
  readonly className?: string
  readonly children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className={verticalNavShellClassName}>
        <h2 className={verticalNavTitleClassName}>{title}</h2>
        <div className={cn("px-4 pb-4", className)}>{children}</div>
      </div>
      {note === undefined ? null : (
        <p className="px-1 text-xs text-muted-foreground">{note}</p>
      )}
    </section>
  )
}
