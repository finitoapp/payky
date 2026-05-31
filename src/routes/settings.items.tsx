import { createFileRoute, Link } from "@tanstack/react-router"
import { ChevronRight, Image, Plus, Trash2 } from "lucide-react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { PhoneViewport } from "@/components/numopay-skeleton.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Separator } from "@/components/ui/separator.tsx"
import { useTranslation } from "@/i18n/use-translation.ts"

export const Route = createFileRoute("/settings/items")({
  component: ItemsPage,
})

function ItemsPage() {
  const { t } = useTranslation()

  return (
    <main className="min-h-svh bg-background text-foreground">
      <PhoneViewport className="px-5 py-6">
        <div className="h-6" />
        <FadeHeader
          title={t("settings.items.title")}
          endAddon={
            <Button
              variant={"ghost"}
              render={<Link aria-label={t("items.add")} to="/items/edit" />}
            >
              <Plus className={"text-primary size-5"} strokeWidth={3} />
            </Button>
          }
        />

        <Link
          to="/items/edit"
          className="mt-12 flex items-center gap-6 rounded-xl hover:bg-muted/50"
        >
          <div className="flex size-28 items-center justify-center rounded-xl bg-card text-muted-foreground">
            <Image />
          </div>
          <h2 className="min-w-0 flex-1 text-xl font-semibold">
            {t("item.beer")}
          </h2>
          <p className="text-lg text-muted-foreground">{t("item.price")}</p>
          <ChevronRight className="text-muted-foreground" />
        </Link>

        <div className="flex-1" />
        <Separator />
        <footer className="flex flex-col gap-8 py-10 text-center">
          <Button variant="ghost" className="text-xl tracking-widest">
            {t("items.import")}
          </Button>
          <Button variant="ghost" className="text-xl tracking-widest">
            {t("items.export")}
          </Button>
          <Button variant="destructive" className="text-base tracking-wider">
            <Trash2 data-icon="inline-start" />
            {t("items.clear")}
          </Button>
        </footer>
      </PhoneViewport>
    </main>
  )
}
