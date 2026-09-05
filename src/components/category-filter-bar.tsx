import { useMemo } from "react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import type { CatalogCategoryId } from "@/core/modules/catalog-category/catalog-category-types.ts"
import type { CategoryFilter } from "@/core/modules/catalog-item/catalog-item-utils.ts"
import { cn } from "@/lib/utils.ts"

export function CategoryFilterBar({
  categories,
  usedCategoryIds,
  value,
  onValueChange,
  allLabel,
  uncategorizedLabel,
  className,
}: {
  readonly categories: ReadonlyArray<{
    readonly id: CatalogCategoryId
    readonly name: string
  }>
  readonly usedCategoryIds: ReadonlySet<CatalogCategoryId | null>
  readonly value: CategoryFilter
  readonly onValueChange: (value: CategoryFilter) => void
  readonly allLabel: string
  readonly uncategorizedLabel: string
  readonly className?: string
}) {
  const availableCategories = useMemo(
    () => categories.filter((category) => usedCategoryIds.has(category.id)),
    [categories, usedCategoryIds]
  )
  const showUncategorized = usedCategoryIds.has(null)

  if (availableCategories.length === 0) return null

  return (
    <div className={cn("overflow-x-auto", className)}>
      <ToggleGroup<CategoryFilter>
        value={[value]}
        onValueChange={(nextValue) => {
          const [next] = nextValue
          if (next === undefined) return
          onValueChange(next)
        }}
        variant="outline"
        size="sm"
        className="w-max"
      >
        <ToggleGroupItem value="all">{allLabel}</ToggleGroupItem>
        {availableCategories.map((category) => (
          <ToggleGroupItem key={category.id} value={category.id}>
            {category.name}
          </ToggleGroupItem>
        ))}
        {showUncategorized && (
          <ToggleGroupItem value="uncategorized">
            {uncategorizedLabel}
          </ToggleGroupItem>
        )}
      </ToggleGroup>
    </div>
  )
}
