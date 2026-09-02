import { Skeleton } from "@/components/ui/skeleton.tsx"
import { cn } from "@/lib/utils.ts"

/**
 * Loading placeholder for `PaymentHistory`/`BillHistory` — same card shell
 * and row layout as `VerticalNav` (see vertical-nav.tsx's `NavItemContent`),
 * with every real value (icon, title, amount/time, status) swapped for a
 * `Skeleton` bar, so the page doesn't jump once the real list mounts.
 */
export function ActivityHistorySkeleton({
  rows = 6,
  className,
}: {
  readonly rows?: number
  readonly className?: string
}) {
  return (
    <div
      className={cn(
        "bg-card flex flex-col rounded-md overflow-hidden shadow",
        className
      )}
    >
      <div className="p-4">
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows, never reordered or filtered
          <ActivityHistorySkeletonRow key={index} />
        ))}
      </div>
    </div>
  )
}

function ActivityHistorySkeletonRow() {
  return (
    <div className="flex w-full items-center gap-3 px-3 py-2">
      <div className="p-2">
        <Skeleton className="size-8 rounded-full" />
      </div>
      <div className="flex w-full flex-col items-start gap-2">
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-3 w-28" />
      </div>
      <div className="pl-2">
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  )
}
