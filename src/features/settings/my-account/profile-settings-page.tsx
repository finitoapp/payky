import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { ImageIcon, Trash2Icon } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { toast } from "sonner"

import { FadeHeader } from "@/components/fade-header.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { linkyEnv } from "@/core/linky/linky-env.ts"
import {
  buildUpdatedProfileMetadata,
  publishNostrProfile,
} from "@/core/linky/nostr-profile.ts"
import { ProfileAvatar } from "@/features/settings/my-account/profile-avatar.tsx"
import { readProfilePicture } from "@/features/settings/my-account/profile-picture.ts"
import { SettingsFormCard } from "@/features/settings/settings-form-card.tsx"
import { useSettingsForm } from "@/features/settings/use-settings-form.ts"
import {
  myNostrProfileQueryKey,
  useLinkyIdentity,
  useMyNostrProfile,
} from "@/hooks/use-linky.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * Edits the name and picture of the account's Nostr profile — the one Linky
 * shows too — and republishes it with the active key. Everything else the
 * published profile carries is kept as it is.
 */
export function ProfileSettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const identity = useLinkyIdentity()
  const profile = useMyNostrProfile(identity)
  const formId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState("")
  const [pictureUrl, setPictureUrl] = useState<string | null>(null)
  const [edited, setEdited] = useState(false)
  const { pending, saved, error, setError, resetSaved, submit } =
    useSettingsForm()

  // The published profile arrives after the form mounts; it seeds the form
  // until the user starts editing.
  useEffect(() => {
    if (edited || profile.data === undefined) return
    setName(profile.data.name ?? "")
    setPictureUrl(profile.data.pictureUrl)
  }, [edited, profile.data])

  const choosePicture = async (file: File | undefined) => {
    if (file === undefined) return
    setError(null)
    resetSaved()
    const dataUrl = await readProfilePicture(file)
    if (dataUrl === null) {
      setError("settings.profile.picture.invalid")
      return
    }
    setPictureUrl(dataUrl)
    setEdited(true)
  }

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.profile.title")} />
      <SettingsFormCard
        title={t("settings.profile.title")}
        description={null}
        savedMessage={saved ? t("settings.profile.saved") : null}
        submitLabel={t("settings.profile.save")}
        pending={pending || profile.isPending}
        onSubmit={(event) => {
          event.preventDefault()
          setError(null)
          resetSaved()

          void submit(async () => {
            try {
              await publishNostrProfile({
                nsec: identity.nsec,
                relays: linkyEnv.VITE_LINKY_NOSTR_RELAYS,
                metadata: buildUpdatedProfileMetadata({
                  current: profile.data?.metadata ?? {},
                  name,
                  pictureUrl,
                }),
              })
            } catch {
              toast.error(t("settings.profile.saveFailed"))
              return false
            }

            await queryClient.invalidateQueries({
              queryKey: myNostrProfileQueryKey(identity.pubkey),
            })
            toast.success(t("settings.profile.saved"))
            await navigate({ to: "/settings" })
            return undefined
          })
        }}
      >
        <FieldGroup>
          <Field data-invalid={error === "settings.profile.picture.invalid"}>
            <FieldLabel htmlFor={`${formId}-picture`}>
              {t("settings.profile.picture.label")}
            </FieldLabel>
            <div className="flex items-center gap-4">
              <ProfileAvatar pictureUrl={pictureUrl} className="size-20" />
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  id={`${formId}-picture`}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={pending}
                  onChange={(event) => {
                    void choosePicture(event.currentTarget.files?.[0])
                    event.currentTarget.value = ""
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageIcon data-icon="inline-start" />
                  {t("settings.profile.picture.choose")}
                </Button>
                {pictureUrl !== null ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      setPictureUrl(null)
                      setEdited(true)
                      resetSaved()
                    }}
                  >
                    <Trash2Icon data-icon="inline-start" />
                    {t("settings.profile.picture.remove")}
                  </Button>
                ) : null}
              </div>
            </div>
            <FieldError>
              {error === "settings.profile.picture.invalid" ? t(error) : null}
            </FieldError>
          </Field>

          <Field>
            <FieldLabel htmlFor={`${formId}-name`}>
              {t("settings.profile.name.label")}
            </FieldLabel>
            <Input
              id={`${formId}-name`}
              value={name}
              disabled={pending}
              autoComplete="off"
              placeholder={t("settings.profile.name.placeholder")}
              onChange={(event) => {
                setName(event.currentTarget.value)
                setEdited(true)
                resetSaved()
              }}
            />
          </Field>
        </FieldGroup>
      </SettingsFormCard>
    </>
  )
}
