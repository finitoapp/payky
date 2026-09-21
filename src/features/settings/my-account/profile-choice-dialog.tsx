import { Card } from "@/components/ui/card.tsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import type { NostrProfile } from "@/core/linky/nostr-profile.ts"
import { ProfileAvatar } from "@/features/settings/my-account/profile-avatar.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

/** Which profile the account shows after a key switch. */
export type ProfileChoice = "keepCurrent" | "useKeyProfile"

export interface ProfileChoiceRequest {
  /** The profile published today, under the key being left. */
  readonly current: NostrProfile
  /** The profile the new key already publishes. */
  readonly next: NostrProfile
}

/** True when the two profiles would look the same on the account card. */
export const profilesLookAlike = (a: NostrProfile, b: NostrProfile): boolean =>
  a.name === b.name && a.pictureUrl === b.pictureUrl

/**
 * Shown when the key being switched to already has a profile that differs
 * from the current one: the merchant picks the one to keep. Keeping the
 * current profile republishes it under the new key; using the key's own
 * profile leaves it as it is.
 */
export function ProfileChoiceDialog({
  request,
  onChoose,
  onCancel,
}: {
  readonly request: ProfileChoiceRequest | null
  readonly onChoose: (choice: ProfileChoice) => void
  readonly onCancel: () => void
}) {
  const { t } = useTranslation()

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("settings.profile.key.profileChoice.title")}
          </DialogTitle>
          <DialogDescription>
            {t("settings.profile.key.profileChoice.description")}
          </DialogDescription>
        </DialogHeader>
        {request ? (
          <div className="flex flex-col gap-2">
            <ProfileOption
              label={t("settings.profile.key.profileChoice.keepCurrent")}
              profile={request.current}
              onClick={() => onChoose("keepCurrent")}
            />
            <ProfileOption
              label={t("settings.profile.key.profileChoice.useKeyProfile")}
              profile={request.next}
              onClick={() => onChoose("useKeyProfile")}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ProfileOption({
  label,
  profile,
  onClick,
}: {
  readonly label: string
  readonly profile: NostrProfile
  readonly onClick: () => void
}) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      className="block rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      onClick={onClick}
    >
      <Card className="flex-row items-center gap-3 px-4 py-3">
        <ProfileAvatar pictureUrl={profile.pictureUrl} className="size-12" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <span
            className={
              profile.name === null
                ? "truncate text-muted-foreground"
                : "truncate font-semibold"
            }
          >
            {profile.name ?? t("settings.profile.key.profileChoice.noName")}
          </span>
        </span>
      </Card>
    </button>
  )
}
