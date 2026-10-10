import { FadeHeader } from "@/components/fade-header.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

/** The sales statistics screen (access/0008), header included. */
export function StatsPage() {
  const { t } = useTranslation()

  return (
    <>
      <FadeHeader title={t("stats.title")} />

      <section className="pt-16">
        <p className="text-center text-muted-foreground">
          {t("stats.placeholder")}
        </p>
      </section>
    </>
  )
}
