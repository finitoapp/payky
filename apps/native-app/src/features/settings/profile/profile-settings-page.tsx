import { optionalTextCodec } from "@payky/app-shared/inline-edit-codecs"
import {
  mergeProfileMetadata,
  type NostrProfile,
  profileFromMetadata,
  publishNostrProfile,
} from "@payky/core/integrations/nostr/nostr-client"
import { useState } from "react"
import { ActivityIndicator, Image, Text as NativeText } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { AppButton } from "../../../components/app-button.tsx"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { InlineEditField } from "../../../components/inline-edit-field.tsx"
import { Screen } from "../../../components/screen.tsx"
import { useCopyToClipboard } from "../../../hooks/use-copy-to-clipboard.ts"
import { useInlineChoice } from "../../../hooks/use-inline-choice.ts"
import {
  useNostrIdentity,
  useNostrProfile,
} from "../../../hooks/use-nostr-profile.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { pickProfilePicture } from "../../../platform/pick-profile-picture.ts"

/**
 * Edits the name and picture of the account's Nostr profile, as web's
 * `ProfileSettingsPage`: republished with the account's key as soon as it is
 * saved. The editor opens only once the published profile is known, so a save
 * never overwrites fields it could not read.
 */
export function ProfileSettingsPage() {
  const { t } = useTranslation()
  const identity = useNostrIdentity()
  const copy = useCopyToClipboard()
  const [attempt, setAttempt] = useState(0)
  const profile = useNostrProfile(identity.pubkey, attempt)

  return (
    <Screen>
      <FadeHeader title={t("settings.profile.title")} />
      <Text color="muted-foreground">{t("settings.profile.description")}</Text>
      {profile.data !== null ? (
        <ProfileEditor profile={profile.data} />
      ) : profile.failed && !profile.loading ? (
        <YStack gap="2" accessibilityRole="alert">
          <Text color="red-600">{t("settings.profile.loadFailed")}</Text>
          <AppButton
            label={t("settings.profile.retry")}
            variant="secondary"
            onPress={() => setAttempt(attempt + 1)}
          />
        </YStack>
      ) : (
        <ActivityIndicator />
      )}
      <YStack gap="1.5">
        <Text fontSize="sm" fontWeight="600">
          {t("settings.profile.npub.label")}
        </Text>
        {/* Tamagui's Text has no `selectable`; the key is long, so it can be copied by hand. */}
        <NativeText selectable style={{ fontSize: 12, opacity: 0.7 }}>
          {identity.npub}
        </NativeText>
        <AppButton
          label={t("settings.profile.npub.copy")}
          variant="secondary"
          onPress={() =>
            void copy(identity.npub, {
              copied: t("settings.profile.npub.copied"),
              failed: t("settings.profile.npub.copyFailed"),
            })
          }
        />
      </YStack>
    </Screen>
  )
}

function ProfileEditor({ profile }: { readonly profile: NostrProfile }) {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const [pictureInvalid, setPictureInvalid] = useState(false)
  // What this screen last published; relays may still serve the previous
  // event for a moment, so it is shown instead of a refetch.
  const [published, setPublished] = useState<NostrProfile | null>(null)
  const current = published ?? profile

  // ponytail: each save merges into the profile as last published here, so a
  // name and a picture saved at the same instant can drop one of the two.
  const publish = (changes: {
    readonly name: string
    readonly picture: string | null
  }) =>
    runToast(async (run) => {
      const metadata = mergeProfileMetadata({
        current: current.metadata,
        ...changes,
      })
      const result = await run(publishNostrProfile({ metadata }))
      if (!result.ok) return "settings.profile.saveFailed"
      setPublished(profileFromMetadata(metadata) ?? current)
      return undefined
    })

  const picture = useInlineChoice(current.picture, (next) =>
    publish({ name: current.name ?? "", picture: next })
  )

  const choosePicture = async () => {
    const picked = await pickProfilePicture()
    if (picked.type === "cancelled") return
    setPictureInvalid(picked.type === "invalid")
    if (picked.type === "picked") await picture.choose(picked.dataUrl)
  }

  return (
    <YStack gap="3">
      <YStack gap="2">
        <Text fontSize="sm" fontWeight="600">
          {t("settings.profile.picture.label")}
        </Text>
        <XStack gap="3" alignItems="center">
          <YStack
            width={80}
            height={80}
            borderRadius={40}
            overflow="hidden"
            backgroundColor="card"
            borderWidth={1}
            borderColor="border-color"
          >
            {picture.value !== null ? (
              <Image
                source={{ uri: picture.value }}
                style={{ width: 80, height: 80 }}
                accessibilityIgnoresInvertColors
              />
            ) : null}
          </YStack>
          <YStack gap="2" flex={1}>
            <AppButton
              label={t("settings.profile.picture.choose")}
              variant="secondary"
              disabled={picture.saving}
              onPress={() => void choosePicture()}
            />
            {picture.value !== null ? (
              <AppButton
                label={t("settings.profile.picture.remove")}
                variant="secondary"
                disabled={picture.saving}
                onPress={() => {
                  setPictureInvalid(false)
                  void picture.choose(null)
                }}
              />
            ) : null}
          </YStack>
        </XStack>
        {pictureInvalid ? (
          <Text color="red-600" accessibilityRole="alert">
            {t("settings.profile.picture.invalid")}
          </Text>
        ) : null}
      </YStack>
      <InlineEditField
        label={t("settings.profile.name.label")}
        placeholder={t("settings.profile.name.placeholder")}
        defaultValue={current.name}
        codec={optionalTextCodec}
        errorKey="settings.profile.name.invalid"
        onSave={(name) =>
          publish({ name: name ?? "", picture: current.picture })
        }
      />
    </YStack>
  )
}
