import { optionalTextCodec } from "@payky/app-shared/inline-edit-codecs"
import {
  mergeProfileMetadata,
  type NostrProfile,
  profileFromMetadata,
  publishNostrProfile,
} from "@payky/core/integrations/nostr/nostr-client"
import { useState } from "react"
import { ActivityIndicator, Text as NativeText } from "react-native"
import { Text, YStack } from "tamagui"
import { AppButton } from "../../../components/app-button.tsx"
import { InlineEditField } from "../../../components/inline-edit-field.tsx"
import { Screen } from "../../../components/screen.tsx"
import { ScreenHeader } from "../../../components/screen-header.tsx"
import {
  useNostrIdentity,
  useNostrProfile,
} from "../../../hooks/use-nostr-profile.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

/**
 * Edits the name of the account's Nostr profile, as web's
 * `ProfileSettingsPage`: republished with the account's key as soon as it is
 * saved. The editor opens only once the published profile is known, so a save
 * never overwrites fields it could not read. The picture (C06) is not here yet.
 */
export function ProfileSettingsPage() {
  const { t } = useTranslation()
  const identity = useNostrIdentity()
  const [attempt, setAttempt] = useState(0)
  const profile = useNostrProfile(identity.pubkey, attempt)

  return (
    <Screen>
      <ScreenHeader title={t("settings.profile.title")} />
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
      </YStack>
    </Screen>
  )
}

function ProfileEditor({ profile }: { readonly profile: NostrProfile }) {
  const { t } = useTranslation()
  const runToast = useRunToast()
  // What this screen last published; relays may still serve the previous
  // event for a moment, so it is shown instead of a refetch.
  const [published, setPublished] = useState<NostrProfile | null>(null)
  const current = published ?? profile

  return (
    <InlineEditField
      label={t("settings.profile.name.label")}
      placeholder={t("settings.profile.name.placeholder")}
      defaultValue={current.name}
      codec={optionalTextCodec}
      errorKey="settings.profile.name.invalid"
      onSave={(name) =>
        runToast(async (run) => {
          const metadata = mergeProfileMetadata({
            current: current.metadata,
            name: name ?? "",
            picture: current.picture,
          })
          const result = await run(publishNostrProfile({ metadata }))
          if (!result.ok) return "settings.profile.saveFailed"
          setPublished(profileFromMetadata(metadata) ?? current)
          return undefined
        })
      }
    />
  )
}
