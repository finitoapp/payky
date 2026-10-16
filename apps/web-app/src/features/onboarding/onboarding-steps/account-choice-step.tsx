import {
  type AccountChoice,
  AccountTypeChoice,
} from "@/features/shared/account/account-type-choice.tsx"

export function AccountChoiceStep({
  pending,
  onSelect,
}: {
  readonly pending: boolean
  readonly onSelect: (accountType: AccountChoice) => void
}) {
  return (
    <AccountTypeChoice
      className="border shadow-none"
      pending={pending}
      onSelect={onSelect}
    />
  )
}
