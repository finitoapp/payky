import { createFileRoute } from "@tanstack/react-router"
import {
  BarChart3,
  ChevronDown,
  Image,
  Minus,
  Plus,
  Search,
  ShoppingBag,
} from "lucide-react"
import { FadeHeader } from "@/components/fade-header.tsx"
import { HeaderStartLink } from "@/components/skeleton.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardAction,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { Field } from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export const Route = createFileRoute("/_terminal/checkout")({
  component: CheckoutPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

export function Counter() {
  return (
    <div className="flex items-center gap-4">
      <Button variant="secondary" size="icon-lg" className="rounded-full">
        <Minus />
      </Button>
      <span className="text-xl font-semibold">1</span>
      <Button variant="secondary" size="icon-lg" className="rounded-full">
        <Plus />
      </Button>
    </div>
  )
}

export function SearchField({ placeholder }: { readonly placeholder: string }) {
  return (
    <Field className="relative">
      <Search className="-translate-y-1/2 absolute top-1/2 left-4 text-muted-foreground" />
      <Input
        aria-label={placeholder}
        placeholder={placeholder}
        className="h-16 rounded-2xl bg-card pr-14 pl-12 text-base"
      />
      <Badge
        variant="outline"
        className="-translate-y-1/2 absolute top-1/2 right-4"
      >
        <BarChart3 />
      </Badge>
    </Field>
  )
}

function CheckoutPage() {
  useScreenWakeLock(true)

  const { t } = useTranslation()

  return (
    <>
      <div className="h-6" />
      <FadeHeader
        title={t("checkout.title")}
        startAddon={<HeaderStartLink to="/" />}
        endAddon={
          <span className="text-base font-semibold text-info">
            {t("checkout.saved")}
          </span>
        }
      />

      <SearchField placeholder={t("checkout.search")} />

      <section className="mt-10 flex items-center gap-5">
        <div className="flex size-24 items-center justify-center rounded-xl bg-card text-muted-foreground">
          <Image />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold">{t("item.beer")}</h2>
          <p className="text-lg text-muted-foreground">{t("item.price")}</p>
        </div>
        <Counter />
      </section>

      <div className="flex-1" />

      <Card className="rounded-3xl bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-4 text-lg text-muted-foreground">
            <ShoppingBag />
            {t("checkout.oneItem")}
          </CardTitle>
          <CardAction className="flex items-center gap-3 text-xl font-semibold">
            {t("checkout.total")}
            <ChevronDown />
          </CardAction>
        </CardHeader>
      </Card>
      <div className="grid grid-cols-2 gap-4">
        <Button className="h-20 rounded-3xl bg-primary-foreground text-xl text-background hover:bg-primary-foreground/90">
          {t("checkout.save")}
        </Button>
        <Button className="h-20 rounded-3xl bg-primary-foreground text-xl text-background hover:bg-primary-foreground/90">
          {t("home.charge")}
        </Button>
      </div>
    </>
  )
}
