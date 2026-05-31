import { createFileRoute } from "@tanstack/react-router"
import { Camera, Plus } from "lucide-react"

import { FadeHeader } from "@/components/fade-header.tsx"
import {
  HeaderStartLink,
  PhoneViewport,
} from "@/components/numopay-skeleton.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent, CardHeader } from "@/components/ui/card.tsx"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Separator } from "@/components/ui/separator.tsx"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import { useTranslation } from "@/i18n/use-translation.ts"

export const Route = createFileRoute("/items/edit")({
  component: EditItemPage,
})

function EditItemPage() {
  const { t } = useTranslation()

  return (
    <main className="min-h-svh bg-card text-foreground">
      <PhoneViewport className="px-0 py-6">
        <div className="h-6" />
        <FadeHeader
          title={t("edit.title")}
          startAddon={<HeaderStartLink to="/settings/items" />}
          endAddon={
            <Button variant="ghost" className="text-base font-semibold">
              {t("checkout.save")}
            </Button>
          }
        />

        <section className="flex flex-col items-center gap-7 px-5 py-8">
          <Button
            variant="ghost"
            className="size-36 rounded-full bg-background text-muted-foreground hover:bg-background/80"
            aria-label={t("edit.addPhoto")}
          >
            <Camera />
          </Button>
          <h2 className="text-xl font-semibold tracking-widest">
            {t("edit.addPhoto")}
          </h2>
        </section>

        <form className="flex flex-col gap-8 px-5">
          <FieldGroup>
            <FieldLabel className="text-lg font-semibold tracking-widest">
              {t("edit.basic")}
            </FieldLabel>
            <Card className="rounded-3xl bg-background">
              <CardContent className="px-0">
                <Field className="grid grid-cols-[8rem_1fr] gap-4 px-6 py-5">
                  <FieldLabel htmlFor="item-name" className="text-lg">
                    {t("edit.name")}
                  </FieldLabel>
                  <Input id="item-name" defaultValue={t("item.beer")} />
                </Field>
                <Separator />
                <Field className="grid grid-cols-[8rem_1fr] gap-4 px-6 py-5">
                  <FieldLabel htmlFor="item-variation" className="text-lg">
                    {t("edit.variation")}
                  </FieldLabel>
                  <Input
                    id="item-variation"
                    placeholder={t("edit.variationPlaceholder")}
                  />
                </Field>
                <Separator />
                <Field className="grid grid-cols-[8rem_1fr] gap-4 px-6 py-5">
                  <FieldLabel htmlFor="item-description" className="text-lg">
                    {t("edit.description")}
                  </FieldLabel>
                  <Input
                    id="item-description"
                    placeholder={t("edit.optional")}
                  />
                </Field>
              </CardContent>
            </Card>
          </FieldGroup>

          <FieldGroup>
            <FieldLabel className="text-lg font-semibold tracking-widest">
              {t("edit.category")}
            </FieldLabel>
            <Card className="rounded-3xl bg-background">
              <CardContent>
                <Button
                  variant="outline"
                  className="h-14 rounded-3xl border-dashed"
                >
                  <Plus data-icon="inline-start" />
                  {t("edit.addNew")}
                </Button>
              </CardContent>
            </Card>
            <FieldDescription className="text-base font-semibold text-foreground">
              {t("edit.categoryHelp")}
            </FieldDescription>
          </FieldGroup>

          <FieldGroup>
            <FieldLabel className="text-lg font-semibold tracking-widest">
              {t("edit.pricing")}
            </FieldLabel>
            <Card className="rounded-3xl bg-background">
              <CardHeader>
                <ToggleGroup
                  defaultValue={["fiat"]}
                  spacing={0}
                  className="grid w-full grid-cols-2"
                  variant="outline"
                  size="lg"
                >
                  <ToggleGroupItem value="fiat" className="w-full">
                    {t("edit.pricing.fiat")}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="bitcoin" className="w-full">
                    {t("edit.pricing.bitcoin")}
                  </ToggleGroupItem>
                </ToggleGroup>
              </CardHeader>
              <CardContent className="grid grid-cols-[auto_1fr_auto] items-center gap-4">
                <span className="text-4xl font-semibold">
                  {t("edit.currency")}
                </span>
                <Input defaultValue="3.00" className="h-20 text-2xl" />
                <Badge variant="secondary" className="text-base">
                  {t("edit.currencyCode")}
                </Badge>
              </CardContent>
            </Card>
          </FieldGroup>
        </form>
      </PhoneViewport>
    </main>
  )
}
