import { ChevronLeft } from "lucide-react"

import { Button } from "@/components/ui/button.tsx"
import {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { RestoreAccountForm } from "@/features/shared/account/restore-account-form.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export function RestoreAccountStep({
  error,
  mnemonic,
  pending,
  onBack,
  onMnemonicChange,
  onRestore,
}: {
  readonly error: TranslationKey | null
  readonly mnemonic: string
  readonly pending: boolean
  readonly onBack: () => void
  readonly onMnemonicChange: (mnemonic: string) => void
  readonly onRestore: () => void
}) {
  const { t } = useTranslation()

  return (
    <>
      <CardHeader>
        <CardTitle>{t("onboarding.restore.title")}</CardTitle>
        <CardDescription>{t("onboarding.restore.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <RestoreAccountForm
          error={error}
          mnemonic={mnemonic}
          pending={pending}
          onMnemonicChange={onMnemonicChange}
          onRestore={onRestore}
        />
      </CardContent>
      <CardFooter>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onBack}
        >
          <ChevronLeft data-icon="inline-start" />
          {t("onboarding.back")}
        </Button>
      </CardFooter>
    </>
  )
}
