import type { CatalogCategoryId } from "@payky/core/modules/catalog-category/catalog-category-types"
import type { CategoryFilter } from "@payky/core/modules/catalog-item/catalog-item-types"
import { useMemo } from "react"
import { FlatList, Pressable } from "react-native"
import { Text, useTheme } from "tamagui"

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
  const theme = useTheme()
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
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: 8 }}
      data={chips}
      keyExtractor={(chip) => chip.value}
      renderItem={({ item: chip }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: chip.value === value }}
          onPress={() => onValueChange(chip.value)}
          style={{
            minHeight: 44,
            paddingHorizontal: 16,
            justifyContent: "center",
            borderRadius: 8,
            borderWidth: chip.value === value ? 2 : 1,
            borderColor:
              chip.value === value
                ? theme.primary.val
                : theme["border-color"].val,
          }}
        >
          <Text fontWeight={chip.value === value ? "600" : "400"}>
            {chip.label}
          </Text>
        </Pressable>
      )}
    />
  )
}
