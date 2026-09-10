import { FolderIcon } from "lucide-react"
import { useCallback } from "react"

import { catalogCategoriesPageQuery } from "@/core/modules/catalog-category/catalog-category-queries.ts"
import { SettingsEntityList } from "@/features/settings/settings-entity-list.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

export function CategoriesList({
  search,
  hasAny,
}: {
  readonly search: string
  readonly hasAny: boolean
}) {
  const { t } = useTranslation()

  const createPageQuery = useCallback(
    (limit: number) => catalogCategoriesPageQuery({ search, limit }),
    [search]
  )

  return (
    <SettingsEntityList
      deps={[search]}
      createPageQuery={createPageQuery}
      hasAny={hasAny}
      emptyTitle={t("settings.categories.empty.title")}
      emptyDescription={t("settings.categories.empty.description")}
      emptySearchLabel={t("settings.categories.emptySearch")}
      renderItem={(category) => ({
        id: category.id,
        kind: "link" as const,
        to: "/settings/categories/$catalogCategoryId",
        params: { catalogCategoryId: category.id },
        icon: <FolderIcon className="text-muted-foreground" />,
        label: category.name,
      })}
    />
  )
}
