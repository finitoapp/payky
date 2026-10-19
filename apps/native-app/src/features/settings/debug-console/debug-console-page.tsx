import {
  type ConsoleOutputHistoryEntry,
  formatConsoleArgs,
} from "@payky/app-shared/console-history"
import { format } from "date-fns"
import { useEffect, useState } from "react"
import { Text, XStack, YStack } from "tamagui"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { Screen } from "../../../components/screen.tsx"
import { Button } from "../../../components/ui/button.tsx"
import { nativeConsoleHistory } from "../../../core/native-runtime.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

const methodColors = {
  trace: "muted-foreground",
  debug: "muted-foreground",
  log: "color",
  info: "blue-600",
  warn: "orange-600",
  error: "red-600",
} as const satisfies Record<ConsoleOutputHistoryEntry["method"], string>

/** The last captured console entries, newest first; in memory only, gone on restart. */
export function DebugConsolePage() {
  const { t } = useTranslation()
  const [paused, setPaused] = useState(false)
  const [entries, setEntries] = useState<
    ReadonlyArray<ConsoleOutputHistoryEntry>
  >(() => nativeConsoleHistory.getEntries())

  useEffect(() => {
    if (paused) return
    setEntries(nativeConsoleHistory.getEntries())
    return nativeConsoleHistory.subscribe(() => {
      setEntries(nativeConsoleHistory.getEntries())
    })
  }, [paused])

  return (
    <Screen>
      <FadeHeader title={t("settings.debugConsole.title")} />
      <Text fontWeight="700">{t("settings.debugConsole.history.title")}</Text>
      <XStack gap="2">
        <YStack flex={1}>
          <Button
            size="lg"
            label={t(
              paused
                ? "settings.debugConsole.resume"
                : "settings.debugConsole.pause"
            )}
            variant="outline"
            onPress={() => setPaused((value) => !value)}
          />
        </YStack>
        <YStack flex={1}>
          <Button
            size="sm"
            label={t("settings.debugConsole.clear")}
            variant="ghost"
            disabled={entries.length === 0}
            onPress={() => {
              nativeConsoleHistory.clearEntries()
              setEntries([])
            }}
          />
        </YStack>
      </XStack>
      {entries.length === 0 ? (
        <Text color="muted-foreground" text="center">
          {t("settings.debugConsole.empty")}
        </Text>
      ) : (
        <YStack gap="2" testID="debug-console-entries">
          {entries.toReversed().map((entry, index) => (
            <YStack
              // biome-ignore lint/suspicious/noArrayIndexKey: console entries do not expose stable ids
              key={index}
              gap="1"
              p="2"
              rounded="md"
              borderWidth={1}
              borderColor="border-color"
            >
              <XStack gap="2" items="center">
                <Text fontSize={11} color="muted-foreground">
                  {format(entry.createdAt, "HH:mm:ss.SSS")}
                </Text>
                <Text
                  fontSize={10}
                  fontWeight="700"
                  color={methodColors[entry.method]}
                >
                  {entry.method.toUpperCase()}
                </Text>
                {entry.path.length === 0 ? null : (
                  <Text
                    flex={1}
                    fontSize={11}
                    color="muted-foreground"
                    numberOfLines={1}
                  >
                    {entry.path.join(" › ")}
                  </Text>
                )}
              </XStack>
              <Text fontSize={11} userSelect="text">
                {formatConsoleArgs(entry.args)}
              </Text>
            </YStack>
          ))}
        </YStack>
      )}
    </Screen>
  )
}
