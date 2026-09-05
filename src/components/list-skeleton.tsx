import { Skeleton } from "@/components/ui/skeleton.tsx"
import { cn } from "@/lib/utils.ts"

/**
 * Loading placeholder for a `VerticalNav`-shaped list (see
 * vertical-nav.tsx's `NavItemContent`): an icon, a two-line label stack, and
 * a trailing action, each swapped for a `Skeleton` bar. Rows fade out
 * (`rows - 1` down to `0.2` opacity) so the placeholder reads as a
 * decaying stream of unknown-length content rather than a fixed block.
 * Generic — reusable for any list styled like `VerticalNav`, not just
 * catalog items.
 */
export function ListSkeleton({
  rows = 5,
  className,
}: {
  readonly rows?: number
  readonly className?: string
}) {
  return (
    <div
      className={cn(
        "bg-card flex flex-col rounded-md overflow-hidden shadow divide-y",
        className
      )}
    >
      {Array.from({ length: rows }, (_, index) => (
        <ListSkeletonRow
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows, never reordered or filtered
          key={index}
          opacity={rows > 1 ? 1 - (index * 0.8) / (rows - 1) : 1}
        />
      ))}
    </div>
  )
}

function ListSkeletonRow({ opacity }: { readonly opacity: number }) {
  return (
    <div
      className="flex w-full items-center gap-3 px-3 py-2"
      style={{ opacity }}
    >
      <div className="p-2">
        <Skeleton className="size-5 rounded-full" />
      </div>
      <div className="flex w-full flex-col items-start gap-2">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="pl-2">
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  )
}
