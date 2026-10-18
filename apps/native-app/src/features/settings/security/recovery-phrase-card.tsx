import { masterKeyToMnemonic } from "@payky/core/modules/shared/key-derivation"
import { useQuery } from "@tanstack/react-query"
import { usePreventScreenCapture } from "expo-screen-capture"
import { useAtomValue } from "jotai"
import { useEffect, useState } from "react"
import { AppState } from "react-native"
import { Text, YStack } from "tamagui"
import { accountAtom } from "../../../atoms/account.ts"
import { AppButton } from "../../../components/app-button.tsx"
import { useRequirePermission } from "../../../core/use-access.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

/**
 * The active account's recovery phrase, hidden by default. It is derived only
 * while shown (a zero-lifetime query, never stored or logged), asks for the
 * owner permission to appear, hides again when the screen unmounts or the app
 * leaves the foreground, blocks screenshots and the recents thumbnail while
 * shown (Android), and is not selectable or copyable.
 */
export function RecoveryPhraseCard() {
  const { t } = useTranslation()
  const { require } = useRequirePermission()
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      // Hide on anything but "active": Android takes the recents thumbnail
      // when the state turns "inactive", before "background" arrives.
      if (state !== "active") setRevealed(false)
    })
    return () => subscription.remove()
  }, [])

  return (
    <YStack
      gap="3"
      p="4"
      rounded="lg"
      borderWidth={1}
      borderColor="border-color"
    >
      <Text fontWeight="700">{t("settings.security.mnemonic.title")}</Text>
      <Text color="muted-foreground">
        {t("settings.security.mnemonic.description")}
      </Text>
      <Text fontSize="sm" fontWeight="600">
        {t("settings.security.mnemonic.label")}
      </Text>
      {revealed ? <RevealedPhrase /> : <Text>{"••••••••••••"}</Text>}
      <Text fontSize={13} color="muted-foreground">
        {t("settings.security.mnemonic.help")}
      </Text>
      <Text fontSize={13} color="muted-foreground">
        {t("settings.security.mnemonic.warning")}
      </Text>
      <AppButton
        label={t(revealed ? "passwordTextarea.hide" : "passwordTextarea.show")}
        variant="secondary"
        onPress={() => {
          if (revealed) {
            setRevealed(false)
            return
          }
          void (async () => {
            if (await require("admin", "access.action.revealRecoveryPhrase")) {
              setRevealed(true)
            }
          })()
        }}
      />
    </YStack>
  )
}

/** Mounted only while shown, so unmounting drops the zero-lifetime query and the phrase with it. */
function RevealedPhrase() {
  usePreventScreenCapture()
  const { id, masterKey } = useAtomValue(accountAtom)
  const phrase = useQuery({
    queryKey: ["recovery-phrase", id],
    queryFn: () => masterKeyToMnemonic(masterKey),
    gcTime: 0,
    staleTime: 0,
  })

  return <Text userSelect="none">{phrase.data ?? "••••••••••••"}</Text>
}
