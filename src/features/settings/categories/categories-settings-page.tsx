import { Link } from "@tanstack/react-router"
import { FolderIcon, PlusIcon } from "lucide-react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { Button } from "@/components/ui/button.tsx"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import { catalogCategoriesQuery } from "@/core/modules/catalog-category/catalog-category-queries.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export function CategoriesSettingsPage() {
  const { t } = useTranslation()
  const { data: categories } = useEvoluQuery(catalogCategoriesQuery)

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

      <VerticalNav
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-lg font-semibold">
              {t("settings.categories.empty.title")}
            </p>
            <p className="text-balance text-sm text-muted-foreground">
              {t("settings.categories.empty.description")}
            </p>
          </div>
        }
        items={categories.map((category) => ({
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
