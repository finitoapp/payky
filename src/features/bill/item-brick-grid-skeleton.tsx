import { Card } from "@/components/ui/card.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { placeholderFadeOpacity } from "@/lib/utils.ts"

/**
 * The item grid's columns, shared with `bill-page.tsx`. On a large monitor
 * the column count follows the width instead of fixed breakpoints.
 */
export const itemBrickGridClassName =
  "grid grid-cols-2 gap-2 pb-4 lg:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]"

/**
 * Loading placeholder for the `/bill` cart grid — mirrors `ItemBrick`'s
 * layout (name/price stack, quantity control bar) with `Skeleton` bars,
 * fading out (`count - 1` down to `0.2` opacity) the same way `ListSkeleton`
 * does for vertical lists.
 */
export function ItemBrickGridSkeleton({
  count = 4,
}: {
  readonly count?: number
}) {
  return (
    <div className={itemBrickGridClassName}>
      {Array.from({ length: count }, (_, index) => (
        <ItemBrickSkeletonCard
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder cards, never reordered or filtered
          key={index}
          opacity={placeholderFadeOpacity(index, count)}
        />
      ))}
    </div>
  )
}

function ItemBrickSkeletonCard({ opacity }: { readonly opacity: number }) {
  return (
    <Card className="gap-3 p-3" style={{ opacity }}>
      <div className="min-w-0">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-2 h-3 w-1/2" />
      </div>
      <Skeleton className="h-9 w-full rounded-md" />
    </Card>
  )
}
