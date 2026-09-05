import { Link } from "@tanstack/react-router"
import { PlusIcon, TagIcon } from "lucide-react"

import { useMemo } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { Button } from "@/components/ui/button.tsx"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import { catalogCategoriesQuery } from "@/core/modules/catalog-category/catalog-category-queries.ts"
import { catalogItemsQuery } from "@/core/modules/catalog-item/catalog-item-queries.ts"
import { getStaffDisplayName } from "@/core/modules/catalog-item/catalog-item-utils.ts"
import { minorUnitsToDecimalString } from "@/core/modules/shared/money.ts"
import { Integer } from "@/core/modules/shared/schema.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export function ItemsSettingsPage() {
  const { t } = useTranslation()
  const { data: items } = useEvoluQuery(catalogItemsQuery)
  const { data: categories } = useEvoluQuery(catalogCategoriesQuery)
  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  )

  return (
    <>
      <div className="h-6" />
      <FadeHeader
        title={t("settings.items.title")}
        endAddon={
          <Button
            variant="ghost"
            nativeButton={false}
            render={
              <Link
                aria-label={t("settings.items.add")}
                to="/settings/items/new"
              />
            }
          >
            <PlusIcon className="text-primary size-5" strokeWidth={3} />
          </Button>
        }
      />

      <VerticalNav
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-lg font-semibold">
              {t("settings.items.empty.title")}
            </p>
            <p className="text-balance text-sm text-muted-foreground">
              {t("settings.items.empty.description")}
            </p>
          </div>
        }
        items={items.map((item) => ({
          id: item.id,
          kind: "link" as const,
          to: "/settings/items/$catalogItemId",
          params: { catalogItemId: item.id },
          icon: <TagIcon className="text-muted-foreground" />,
          label: (
            <span className="flex flex-col">
              <span>{getStaffDisplayName(item)}</span>
              {item.categoryId !== null &&
                categoryNameById.get(item.categoryId) !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {categoryNameById.get(item.categoryId)}
                  </span>
                )}
            </span>
          ),
          action: (
            <span className="text-sm font-medium text-muted-foreground">
              {minorUnitsToDecimalString({
                value: Integer(item.unitAmount),
                currency: item.currency,
              })}{" "}
              {item.currency}
            </span>
          ),
        }))}
      />
    </>
  )
}
