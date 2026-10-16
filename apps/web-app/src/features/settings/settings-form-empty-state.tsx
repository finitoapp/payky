import { FadeHeader } from "@/components/fade-header.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

/**
 * Shown by a settings edit form when the route's id doesn't parse or matches
 * no row. Keeps the page's own header so the screen doesn't collapse to a
 * bare sentence.
 */
export function SettingsFormEmptyState({
  titleKey,
  messageKey,
}: {
  readonly titleKey: TranslationKey
  readonly messageKey: TranslationKey
}) {
  const { t } = useTranslation()

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t(titleKey)} />
      <p className="mt-16 px-6 text-center text-muted-foreground">
        {t(messageKey)}
      </p>
    </>
  )
}
