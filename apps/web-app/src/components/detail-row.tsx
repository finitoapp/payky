import type { ReactNode } from "react"
import { cn } from "@/lib/utils.ts"

/** A label and its value in a detail card: side by side, or `stacked` for long values. */
export function DetailRow({
  label,
  value,
  stacked,
  emphasize,
  children,
}: {
  readonly label: string
  readonly value?: string
  readonly stacked?: boolean
  readonly emphasize?: boolean
  readonly children?: ReactNode
}) {
  return (
    <div
      className={
        stacked
          ? "flex flex-col gap-1 text-sm"
          : "flex items-start justify-between gap-4 text-sm"
      }
    >
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          stacked ? undefined : "max-w-56 break-all text-right",
          emphasize ? "font-semibold" : "font-medium"
        )}
      >
        {children ?? value}
      </span>
    </div>
  )
}
