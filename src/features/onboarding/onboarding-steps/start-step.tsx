import { KeyRound, Plus } from "lucide-react"

import { Button } from "@/components/ui/button.tsx"
import type { OnboardingAccountType } from "@/features/onboarding/onboarding-form-state.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * The first screen, laid out like Linky's: the app mark, one line on what
 * Payky is, and the two ways in — a new account or the 20 words of an
 * existing one. Nothing else is asked before the terminal works.
 */
export function StartStep({
  pending,
  onSelect,
}: {
  readonly pending: boolean
  readonly onSelect: (accountType: OnboardingAccountType) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center gap-8 px-2 py-6 text-center">
      <img
        src="/pwa-icon.svg"
        alt=""
        className="size-24 rounded-3xl shadow-sm"
      />
      <div className="flex flex-col gap-2">
        <h1 className="font-semibold text-3xl leading-tight">
          {t("onboarding.title")}
        </h1>
        <p className="text-balance text-muted-foreground">
          {t("onboarding.start.subtitle")}
        </p>
      </div>
      <div className="flex w-full flex-col gap-5">
        <div className="flex flex-col items-center gap-2">
          <Button
            type="button"
            size="lg"
            className="h-14 w-full text-base"
            disabled={pending}
            onClick={() => onSelect("new")}
          >
            <Plus data-icon="inline-start" />
            {t("onboarding.start.create")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t("onboarding.start.createHint")}
          </p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-14 w-full text-base"
            disabled={pending}
            onClick={() => onSelect("restore")}
          >
            <KeyRound data-icon="inline-start" />
            {t("onboarding.start.restore")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t("onboarding.start.restoreHint")}
          </p>
        </div>
      </div>
    </div>
  )
}
