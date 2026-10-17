import { createAppOwner, hexToBytes } from "@evolu/common"
import { createDateDep } from "@payky/core/deps"
import { createOrSelectAccount } from "@payky/core/evolu/device-account"
import {
  formatTransferCode,
  startTransferTarget,
  type TransferTargetState,
} from "@payky/core/integrations/nostr/nostr-account-transfer"
import { createNostrDep } from "@payky/core/integrations/nostr/nostr-client"
import { deriveEvoluOwnerSecret } from "@payky/core/modules/shared/key-derivation"
import { parsePairUri } from "@payky/core/modules/shared/payky-uri"
import { useLocalSearchParams } from "expo-router"
import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useState } from "react"
import { SafeAreaView } from "react-native-safe-area-context"
import { Button, Text, useTheme, View } from "tamagui"
import { deviceEvoluAtom } from "../../atoms/device-evolu.ts"
import { reloadAppEvoluAtom } from "../../atoms/evolu-counter.ts"
import { nativeEnv } from "../../core/native-env.ts"

const decodeHex = (hex: string | undefined): string => {
  if (hex === undefined || !/^(?:[0-9a-f]{2})*$/u.test(hex)) return ""
  return new TextDecoder().decode(hexToBytes(hex))
}

type View_ =
  | { readonly phase: "invalid"; readonly error: string }
  | { readonly phase: "added"; readonly created: boolean }
  | TransferTargetState

/**
 * Diagnostic target of the account transfer (account/0001), opened by
 * `payky-native-preview://pair?hex=<hex of the payky:pair URI>` (hex, because
 * Expo Router decodes the link before splitting its query at `&`). Shows only the
 * derived app owner id of the received key, never the key itself.
 */
export function PairTargetPage() {
  const theme = useTheme()
  const { hex } = useLocalSearchParams<{ hex?: string }>()
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const reload = useSetAtom(reloadAppEvoluAtom)
  const [view, setView] = useState<View_>({ phase: "connecting" })

  useEffect(() => {
    const pair = parsePairUri(decodeHex(hex))
    if (!pair.ok) {
      setView({ phase: "invalid", error: pair.error.type })
      return
    }
    setView({ phase: "connecting" })
    const session = startTransferTarget(
      {
        ...createNostrDep(nativeEnv.EXPO_PUBLIC_PAYKY_NOSTR_RELAYS),
        ...createDateDep(),
      },
      { pair: pair.value, onState: setView }
    )
    return session.cancel
  }, [hex])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }}>
      <View p="6" gap="4">
        <Text fontWeight="700" fontSize={24}>
          Pair target
        </Text>
        <Text testID="pair-phase">phase: {view.phase}</Text>
        {view.phase === "invalid" && <Text>error: {view.error}</Text>}
        {view.phase === "code" ? (
          <Text fontSize={40} fontWeight="700" testID="pair-code">
            {formatTransferCode(view.code)}
          </Text>
        ) : null}
        {view.phase === "failed" ? <Text>reason: {view.reason}</Text> : null}
        {view.phase === "received" ? (
          <>
            <Text>account: {view.payload.accountName}</Text>
            <Text testID="pair-owner-id">
              derived owner id:{" "}
              {
                createAppOwner(deriveEvoluOwnerSecret(view.payload.masterKey))
                  .id
              }
            </Text>
            <Button
              onPress={async () => {
                const { created } = await createOrSelectAccount(
                  deviceEvolu,
                  view.payload.masterKey,
                  {
                    name: view.payload.accountName,
                    transports: view.payload.transports,
                  }
                )
                reload()
                setView({ phase: "added", created })
              }}
            >
              Add received account
            </Button>
          </>
        ) : null}
        {view.phase === "added" ? (
          <Text>
            {view.created
              ? "account added and selected"
              : "account already on this device, selected"}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  )
}
