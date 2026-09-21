import { useQueryClient } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { CopyIcon, KeyRoundIcon, RotateCcwIcon } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"

import { accountAtom } from "@/atoms/account.ts"
import { PasswordTextarea } from "@/components/password-textarea.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import {
  deriveLinkyIdentity,
  identityFromNsec,
  type LinkyIdentity,
} from "@/core/linky/linky-identity.ts"
import {
  fetchNostrProfile,
  type NostrProfile,
} from "@/core/linky/nostr-profile.ts"
import { switchLinkyIdentity } from "@/core/linky/switch-linky-identity.ts"
import {
  type ProfileChoice,
  ProfileChoiceDialog,
  type ProfileChoiceRequest,
  profilesLookAlike,
} from "@/features/settings/my-account/profile-choice-dialog.tsx"
import { useConfirmDialog } from "@/hooks/use-confirm-dialog.ts"
import {
  myNostrProfileQueryKey,
  useLinkyStore,
  useMyNostrProfile,
  useNostrRelays,
} from "@/hooks/use-linky.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { copyToClipboard } from "@/lib/clipboard.ts"

const EMPTY_PROFILE: NostrProfile = {
  name: null,
  pictureUrl: null,
  metadata: {},
}

const hasProfile = (profile: NostrProfile): boolean =>
  Object.keys(profile.metadata).length > 0

/**
 * The key the profile is signed with. Normally the one the recovery phrase
 * derives; the merchant can paste another `nsec` instead, and go back. Both
 * changes are written to the synced identity row, so every app and device
 * on this recovery phrase switches with it. A key that already publishes a
 * different name or picture asks which profile to keep before switching.
 */
export function NostrKeyCard({
  identity,
}: {
  readonly identity: LinkyIdentity
}) {
  const { t } = useTranslation()
  const confirm = useConfirmDialog()
  const queryClient = useQueryClient()
  const { identity: identityRepository } = useLinkyStore()
  const { masterKey } = useAtomValue(accountAtom)
  const relays = useNostrRelays(identity)
  const profile = useMyNostrProfile(identity)
  const nsecInputId = useId()
  const [editing, setEditing] = useState(false)
  const [nsec, setNsec] = useState("")
  const [error, setError] = useState<TranslationKey | null>(null)
  const [pending, setPending] = useState(false)
  const [profileChoice, setProfileChoice] = useState<
    | (ProfileChoiceRequest & {
        readonly resolve: (choice: ProfileChoice | null) => void
      })
    | null
  >(null)

  /**
   * Which profile the account shows after the switch: the key's own when it
   * already publishes one that looks the same, the current one when the key
   * has none, and the merchant's pick when the two differ. `null` cancels.
   */
  const chooseProfile = async (
    next: LinkyIdentity
  ): Promise<Readonly<Record<string, unknown>> | null | "cancel"> => {
    const current = profile.data ?? EMPTY_PROFILE
    const nextProfile = await fetchNostrProfile({
      pubkey: next.pubkey,
      relays,
    })
    if (!hasProfile(nextProfile)) return current.metadata
    if (profilesLookAlike(current, nextProfile)) return null

    const choice = await new Promise<ProfileChoice | null>((resolve) => {
      setProfileChoice({ current, next: nextProfile, resolve })
    })
    setProfileChoice(null)
    if (choice === null) return "cancel"
    return choice === "keepCurrent" ? current.metadata : null
  }

  const switchTo = async (next: LinkyIdentity) => {
    setPending(true)
    try {
      const profileMetadata = await chooseProfile(next)
      if (profileMetadata === "cancel") return

      const confirmed = await confirm({
        title: t("settings.profile.key.switch.confirm.title"),
        description: t("settings.profile.key.switch.confirm.description"),
        confirmLabel: t("settings.profile.key.switch.confirm.action"),
        cancelLabel: t("settings.profile.key.switch.confirm.cancel"),
      })
      if (!confirmed) return

      await switchLinkyIdentity({
        identityRepository,
        next,
        relays,
        profileMetadata,
      })
      await queryClient.invalidateQueries({
        queryKey: myNostrProfileQueryKey(next.pubkey),
      })
      setEditing(false)
      setNsec("")
      toast.success(
        t(
          profileMetadata === null
            ? "settings.profile.key.switchedKeyProfile"
            : "settings.profile.key.switchedKeptProfile"
        )
      )
    } catch {
      toast.error(t("settings.profile.key.switchFailed"))
    } finally {
      setPending(false)
    }
  }

  const submitCustomKey = () => {
    const next = identityFromNsec(nsec, "custom")
    if (next === null) {
      setError("settings.profile.key.nsec.invalid")
      return
    }
    if (next.pubkey === identity.pubkey) {
      setError("settings.profile.key.nsec.same")
      return
    }
    setError(null)
    void switchTo(next)
  }

  const copyNpub = () =>
    copyToClipboard(identity.npub, {
      copied: t("settings.myAccount.npubCopied"),
      failed: t("settings.myAccount.npubCopyFailed"),
    })

  return (
    <Card>
      <ProfileChoiceDialog
        request={profileChoice}
        onChoose={(choice) => profileChoice?.resolve(choice)}
        onCancel={() => profileChoice?.resolve(null)}
      />
      <CardHeader>
        <CardTitle>{t("settings.profile.key.title")}</CardTitle>
        <CardDescription>
          {t("settings.profile.key.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Badge variant="secondary" data-testid="nostr-key-source">
            {t(
              identity.source === "derived"
                ? "settings.profile.key.derived"
                : "settings.profile.key.custom"
            )}
          </Badge>
          <div className="flex items-center gap-1">
            <span
              className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
              title={identity.npub}
            >
              {identity.npub}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-6 shrink-0 text-muted-foreground"
              aria-label={t("settings.myAccount.copyNpub")}
              onClick={() => void copyNpub()}
            >
              <CopyIcon className="size-3.5" />
            </Button>
          </div>
        </div>

        {editing ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              submitCustomKey()
            }}
          >
            <FieldGroup>
              <Field data-invalid={error !== null}>
                <FieldLabel htmlFor={nsecInputId}>
                  {t("settings.profile.key.nsec.label")}
                </FieldLabel>
                <PasswordTextarea
                  id={nsecInputId}
                  value={nsec}
                  hideLabel={t("passwordTextarea.hide")}
                  showLabel={t("passwordTextarea.show")}
                  disabled={pending}
                  aria-invalid={error !== null}
                  autoComplete="off"
                  placeholder="nsec1…"
                  onChange={(event) => {
                    setNsec(event.currentTarget.value)
                    setError(null)
                  }}
                />
                <FieldDescription>
                  {t("settings.profile.key.nsec.description")}
                </FieldDescription>
                <FieldError>{error ? t(error) : null}</FieldError>
              </Field>
            </FieldGroup>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setEditing(false)
                  setNsec("")
                  setError(null)
                }}
              >
                {t("settings.profile.key.cancel")}
              </Button>
              <Button type="submit" disabled={pending || nsec.trim() === ""}>
                {t("settings.profile.key.switch")}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            {identity.source === "custom" ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => void switchTo(deriveLinkyIdentity(masterKey))}
              >
                <RotateCcwIcon data-icon="inline-start" />
                {t("settings.profile.key.useDerived")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setEditing(true)}
            >
              <KeyRoundIcon data-icon="inline-start" />
              {t("settings.profile.key.useCustom")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
