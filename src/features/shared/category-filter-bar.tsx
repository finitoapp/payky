import { useEffect, useMemo, useRef, useState } from "react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import type { CatalogCategoryId } from "@/core/modules/catalog-category/catalog-category-types.ts"
import type { CategoryFilter } from "@/core/modules/catalog-item/catalog-item-types.ts"
import { cn } from "@/lib/utils.ts"

const chipClassName = "h-11 px-4"

export function CategoryFilterBar<Extra extends string = never>({
  categories,
  usedCategoryIds,
  value,
  onValueChange,
  allLabel,
  uncategorizedLabel,
  extraOptions = [],
  className,
}: {
  readonly categories: ReadonlyArray<{
    readonly id: CatalogCategoryId
    readonly name: string
  }>
  readonly usedCategoryIds: ReadonlySet<CatalogCategoryId | null>
  readonly value: CategoryFilter | Extra
  readonly onValueChange: (value: CategoryFilter | Extra) => void
  readonly allLabel: string
  readonly uncategorizedLabel: string
  /** Filters of the caller's own, offered right after "all". */
  readonly extraOptions?: ReadonlyArray<{
    readonly value: Extra
    readonly label: string
  }>
  readonly className?: string
}) {
  const availableCategories = useMemo(
    () => categories.filter((category) => usedCategoryIds.has(category.id)),
    [categories, usedCategoryIds]
  )
  const showUncategorized = usedCategoryIds.has(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState({ start: false, end: false })

  // Fades whichever edge hides more chips, so a row cut off at the screen
  // edge reads as one that scrolls.
  useEffect(() => {
    const element = scrollRef.current
    if (element === null) return
    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = element
      setOverflow({
        start: scrollLeft > 1,
        end: scrollLeft + clientWidth < scrollWidth - 1,
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    element.addEventListener("scroll", update, { passive: true })
    return () => {
      observer.disconnect()
      element.removeEventListener("scroll", update)
    }
    // Re-attached once there are chips: with none, nothing was rendered.
  }, [availableCategories.length, extraOptions.length])

  if (availableCategories.length === 0 && extraOptions.length === 0) {
    return null
  }

  const fadeStart = "transparent, black 2rem"
  const fadeEnd = "black calc(100% - 2rem), transparent"
  const maskImage =
    overflow.start || overflow.end
      ? `linear-gradient(to right, ${overflow.start ? fadeStart : "black"}, ${overflow.end ? fadeEnd : "black"})`
      : undefined

  return (
    <div
      ref={scrollRef}
      // A thin scrollbar for a mouse, which has no other way to reach the
      // chips past the edge; a finger swipes, so touch screens hide it.
      className={cn(
        "overflow-x-auto pb-1 [scrollbar-width:thin] pointer-coarse:pb-0 pointer-coarse:[scrollbar-width:none]",
        className
      )}
      style={{ maskImage }}
    >
      <ToggleGroup<CategoryFilter | Extra>
        value={[value]}
        onValueChange={(nextValue) => {
          const [next] = nextValue
          if (next === undefined) return
          onValueChange(next)
        }}
        variant="outline"
        className="w-max"
      >
        {/* 44 px tall: a chip is a touch target, not a label. */}
        <ToggleGroupItem value="all" className={chipClassName}>
          {allLabel}
        </ToggleGroupItem>
        {extraOptions.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className={chipClassName}
          >
            {option.label}
          </ToggleGroupItem>
        ))}
        {availableCategories.map((category) => (
          <ToggleGroupItem
            key={category.id}
            value={category.id}
            className={chipClassName}
          >
            {category.name}
          </ToggleGroupItem>
        ))}
        {showUncategorized && (
          <ToggleGroupItem value="uncategorized" className={chipClassName}>
            {uncategorizedLabel}
          </ToggleGroupItem>
        )}
      </ToggleGroup>
    </div>
  )
}
