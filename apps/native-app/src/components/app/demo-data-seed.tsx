import { generateDemoData } from "@payky/core/demo-data/demo-data-generator"
import { markDemoAccountSeeded } from "@payky/core/evolu/device-account"
import { router } from "expo-router"
import { useAtomValue } from "jotai"
import { useEffect, useRef, useState } from "react"
import { Modal } from "react-native"
import { Text, YStack } from "tamagui"
import { accountAtom } from "../../atoms/account.ts"
import { deviceEvoluAtom } from "../../atoms/device-evolu.ts"
import { nativeConsole } from "../../core/native-runtime.ts"
import { useCashuAppRun } from "../../hooks/use-app-run.ts"
import { useTranslation } from "../../hooks/use-translation.ts"
import { AppButton } from "../app-button.tsx"

/** The most history generated, from today back; stopping ends it sooner. */
const maxHistoryDays = 90

type SeedState =
  | { readonly status: "idle" }
  | {
      readonly status: "running"
      readonly done: number
      readonly total: number
    }
  | {
      readonly status: "finished"
      readonly payments: number
      readonly days: number
    }
  | { readonly status: "failed" }

/**
 * Generates a demo account's history the first time the app opens it
 * (demo-data/0001), in a dialog that cannot be dismissed until it is done.
 * History is generated from today back, so stopping (which finishes the day
 * in progress first) leaves an unbroken history up to now.
 *
 * The account is marked seeded before generating, not after: a run cut short
 * by closing the app leaves a partial demo account, which can be removed and
 * created again, rather than a second history generated over the first.
 * A failure is a handled outcome with its own dialog, so it goes to the
 * console, not Sentry.
 */
export function DemoDataSeed() {
  const account = useAtomValue(accountAtom)
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const cashuAppRun = useCashuAppRun()
  const { t, language } = useTranslation()
  const [state, setState] = useState<SeedState>({ status: "idle" })
  const [dismissed, setDismissed] = useState(false)
  const started = useRef(false)
  const stopRequested = useRef(false)
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    if (account.demo !== "pending" || started.current) return
    started.current = true
    markDemoAccountSeeded(deviceEvolu, account.id)

    void (async () => {
      setState({ status: "running", done: 0, total: 1 })
      try {
        await using run = await cashuAppRun()
        const { payments, days } = await run.ok(
          generateDemoData({
            language,
            now: new Date(),
            days: maxHistoryDays,
            shouldStop: () => stopRequested.current,
            onProgress: (done, total) => {
              setState({ status: "running", done, total })
              // Evolu reruns every subscribed query after each write, and
              // the home screen's grow with the history: wait on a page
              // that subscribes to almost nothing.
              if (done === 0) router.replace("/settings/about")
            },
          })
        )
        setState({ status: "finished", payments, days })
        router.replace("/")
      } catch (error) {
        nativeConsole.error("Generating demo data failed.", error)
        setState({ status: "failed" })
      }
    })()
  }, [account.demo, account.id, cashuAppRun, deviceEvolu, language])

  if (state.status === "idle" || dismissed) return null
  const running = state.status === "running"

  return (
    <Modal
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!running) setDismissed(true)
      }}
    >
      <YStack flex={1} justify="center" p="6" bg="rgba(0,0,0,0.6)">
        <YStack gap="3" p="5" rounded="lg" bg="background">
          <Text fontWeight="700" fontSize={20}>
            {t(
              state.status === "running"
                ? "demoData.running.title"
                : state.status === "failed"
                  ? "demoData.failed.title"
                  : "demoData.finished.title"
            )}
          </Text>
          <Text color="muted-foreground">
            {state.status === "running"
              ? t("demoData.running.description")
              : state.status === "failed"
                ? t("demoData.failed.description")
                : t("demoData.finished.description", {
                    payments: String(state.payments),
                    days: String(state.days),
                  })}
          </Text>
          {state.status === "running" ? (
            <>
              <YStack
                height={8}
                rounded="lg"
                bg="border-color"
                overflow="hidden"
              >
                <YStack
                  height={8}
                  bg="primary"
                  width={`${(state.done / state.total) * 100}%`}
                />
              </YStack>
              <Text fontSize="sm" color="muted-foreground">
                {t(
                  stopping
                    ? "demoData.running.stopping"
                    : "demoData.running.progress",
                  { done: String(state.done), total: String(state.total) }
                )}
              </Text>
              <AppButton
                label={t("demoData.stop")}
                variant="secondary"
                disabled={stopping}
                onPress={() => {
                  stopRequested.current = true
                  setStopping(true)
                }}
              />
            </>
          ) : (
            <AppButton
              label={t("demoData.close")}
              onPress={() => setDismissed(true)}
            />
          )}
        </YStack>
      </YStack>
    </Modal>
  )
}
