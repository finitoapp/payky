import { Redirect, useLocalSearchParams } from "expo-router"
import { useEffect, useState } from "react"
import { Text, YStack } from "tamagui"
import { nativeEnv } from "../core/native-env.ts"
import { useAppRun } from "../hooks/use-app-run.ts"
import { e2eActions } from "./e2e-actions.ts"

/**
 * `/e2e/<action>?<params>`: runs one `e2eActions` entry and prints
 * `E2E OK <action>` (and its value) or `E2E FAIL <action>: <message>`, which
 * the flow waits for before going on — its stand-in for awaiting web's
 * `page.evaluate`. Outside an e2e build (`EXPO_PUBLIC_PAYKY_E2E`) it only
 * redirects home. The text is for Maestro, not for people, so it is not
 * translated.
 */
export function E2eBridgePage() {
  const { action = "", ...params } = useLocalSearchParams<{
    action: string
  }>()
  const appRun = useAppRun()
  const [result, setResult] = useState<string | null>(null)
  const paramsKey = JSON.stringify(params)

  // biome-ignore lint/correctness/useExhaustiveDependencies: paramsKey stands for params
  useEffect(() => {
    const run = e2eActions[action]
    if (!nativeEnv.EXPO_PUBLIC_PAYKY_E2E || run === undefined) return
    let cancelled = false
    setResult(null)
    const perform = async () => {
      try {
        await using appRunScope = appRun()
        const value = await run(
          appRunScope,
          Object.fromEntries(
            Object.entries(params).map(([key, v]) => [key, String(v)])
          )
        )
        if (!cancelled)
          setResult(`E2E OK ${action}${value === undefined ? "" : ` ${value}`}`)
      } catch (error) {
        if (!cancelled)
          setResult(
            `E2E FAIL ${action}: ${error instanceof Error ? error.message : String(error)}`
          )
      }
    }
    void perform()
    return () => {
      cancelled = true
    }
  }, [action, appRun, paramsKey])

  if (!nativeEnv.EXPO_PUBLIC_PAYKY_E2E) return <Redirect href="/" />
  return (
    <YStack flex={1} p="4" bg="background">
      <Text testID="e2e-result" color="foreground">
        {e2eActions[action] === undefined
          ? `E2E FAIL ${action}: unknown action`
          : (result ?? `E2E RUNNING ${action}`)}
      </Text>
    </YStack>
  )
}
