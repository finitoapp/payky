import type { CatalogCategoryId } from "@payky/core/modules/catalog-category/catalog-category-types"
import type { CategoryFilter } from "@payky/core/modules/catalog-item/catalog-item-types"
import { useMemo } from "react"
import { ScrollView } from "react-native"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "../../components/ui/toggle-group.tsx"

interface FilterChip<Value extends string> {
  readonly value: Value
  readonly label: string
}

/**
 * The bill grid's category chips, as web's `CategoryFilterBar`: "all", the
 * caller's own filters, then only the categories that hold an item in the
 * bill's currency, then "uncategorized" when some item has none.
 */
export function CategoryFilterBar<Extra extends string = never>({
  categories,
  usedCategoryIds,
  value,
  onValueChange,
  allLabel,
  uncategorizedLabel,
  extraOptions = [],
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
  readonly extraOptions?: ReadonlyArray<FilterChip<Extra>>
}) {
  const chips = useMemo(() => {
    const result: FilterChip<CategoryFilter | Extra>[] = [
      { value: "all", label: allLabel },
      ...extraOptions,
      ...categories
        .filter((category) => usedCategoryIds.has(category.id))
        .map((category) => ({ value: category.id, label: category.name })),
    ]
    if (usedCategoryIds.has(null)) {
      result.push({ value: "uncategorized", label: uncategorizedLabel })
    }
    return result
  }, [allLabel, categories, extraOptions, uncategorizedLabel, usedCategoryIds])

  // Nothing to choose between.
  if (chips.length <= 1) return null

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
    >
      <ToggleGroup
        value={value}
        onValueChange={onValueChange}
        variant="outline"
      >
        {chips.map((chip) => (
          <ToggleGroupItem
            key={chip.value}
            value={chip.value}
            minH={44}
            px={16}
          >
            {chip.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </ScrollView>
  )
}
