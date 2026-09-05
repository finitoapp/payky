import { Link } from "@tanstack/react-router"
import { FolderIcon, PlusIcon } from "lucide-react"

import { useMemo, useState } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { SearchInput } from "@/components/search-input.tsx"
import { Button } from "@/components/ui/button.tsx"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import { catalogCategoriesQuery } from "@/core/modules/catalog-category/catalog-category-queries.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export function CategoriesSettingsPage() {
  const { t } = useTranslation()
  const { data: categories } = useEvoluQuery(catalogCategoriesQuery)
  const [search, setSearch] = useState("")
  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query === ""
      ? categories
      : categories.filter((category) =>
          category.name.toLowerCase().includes(query)
        )
  }, [categories, search])

  return (
    <>
      <div className="h-6" />
      <FadeHeader
        title={t("settings.categories.title")}
        endAddon={
          <Button
            variant="ghost"
            nativeButton={false}
            render={
              <Link
                aria-label={t("settings.categories.add")}
                to="/settings/categories/new"
              />
            }
          >
            <PlusIcon className="text-primary size-5" strokeWidth={3} />
          </Button>
        }
      />

      {categories.length > 0 && (
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("settings.categories.search")}
          clearAriaLabel={t("settings.categories.search.clear.aria")}
        />
      )}

      <VerticalNav
        empty={
          categories.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="text-lg font-semibold">
                {t("settings.categories.empty.title")}
              </p>
              <p className="text-balance text-sm text-muted-foreground">
                {t("settings.categories.empty.description")}
              </p>
            </div>
          ) : (
            <p className="py-10 text-center text-muted-foreground">
              {t("settings.categories.emptySearch")}
            </p>
          )
        }
        items={filteredCategories.map((category) => ({
          id: category.id,
          kind: "link" as const,
          to: "/settings/categories/$catalogCategoryId",
          params: { catalogCategoryId: category.id },
          icon: <FolderIcon className="text-muted-foreground" />,
          label: category.name,
        }))}
      />
    </>
  )
}
