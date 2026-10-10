import { KeyRound, Plus, QrCode } from "lucide-react"

import { VerticalNav } from "@/components/vertical-nav.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

/** The ways an account gets onto a device, offered the same everywhere. */
export type AccountChoice = "new" | "restore" | "transfer"

interface AccountChoiceOption {
  readonly value: AccountChoice
  readonly label: TranslationKey
  readonly description: TranslationKey
  readonly icon: typeof Plus
}

const accountChoiceOptions: ReadonlyArray<AccountChoiceOption> = [
  {
    value: "new",
    label: "accountChoice.new.title",
    description: "accountChoice.new.description",
    icon: Plus,
  },
  {
    value: "restore",
    label: "accountChoice.restore.title",
    description: "accountChoice.restore.description",
    icon: KeyRound,
  },
  {
    value: "transfer",
    label: "accountChoice.transfer.title",
    description: "accountChoice.transfer.description",
    icon: QrCode,
  },
]

/**
 * A signpost, not a selection: picking an option leaves it immediately, so
 * `VerticalNav` rather than a toggle group, which would show the previous
 * answer as pressed when the user comes back. Onboarding's account step and
 * Settings → Accounts both offer it.
 */
export function AccountTypeChoice({
  pending,
  title,
  className,
  onSelect,
}: {
  readonly pending: boolean
  readonly title?: string
  readonly className?: string
  readonly onSelect: (choice: AccountChoice) => void
}) {
  const { t } = useTranslation()

  return (
    <VerticalNav
      title={title}
      className={className}
      items={accountChoiceOptions.map((option) => {
        const Icon = option.icon

        return {
          id: option.value,
          kind: "button" as const,
          icon: <Icon className="text-muted-foreground" />,
          label: (
            <span className="flex flex-col gap-1">
              <span className="text-sm font-semibold">{t(option.label)}</span>
              <span className="text-xs leading-snug text-muted-foreground">
                {t(option.description)}
              </span>
            </span>
          ),
          onClick: () => {
            if (pending) return
            onSelect(option.value)
          },
        }
      })}
    />
  )
}
