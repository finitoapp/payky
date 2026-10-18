import { formatCountdown } from "@payky/app-shared/format-text"
import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { createDateDep } from "@payky/core/deps"
import {
  startTransferSource,
  type TransferPayload,
  type TransferSource,
  type TransferSourceState,
} from "@payky/core/integrations/nostr/nostr-account-transfer"
import { createNostrDep } from "@payky/core/integrations/nostr/nostr-client"
import {
  NonEmptyString255,
  WssUrlSchema,
} from "@payky/core/modules/shared/schema"
import { router } from "expo-router"
import { useAtomValue, useStore } from "jotai"
import TriangleAlert from "lucide-react-native/icons/triangle-alert"
import { Fragment, useEffect, useRef, useState } from "react"
import { Text, YStack } from "tamagui"
import { accountAtom } from "../../../atoms/account.ts"
import { evoluCounterAtom } from "../../../atoms/evolu-counter.ts"
import { AppButton } from "../../../components/app-button.tsx"
import { QrCode } from "../../../components/qr-code.tsx"
import { Screen } from "../../../components/screen.tsx"
import { ScreenHeader } from "../../../components/screen-header.tsx"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../../components/ui/alert.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "../../../components/ui/field.tsx"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "../../../components/ui/input-otp.tsx"
import { nativeEnv } from "../../../core/native-env.ts"
import { useAccess, useRequirePermission } from "../../../core/use-access.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

type FailureReason = Extract<TransferSourceState, { phase: "failed" }>["reason"]

const failureKeys = {
  conflict: "accountTransfer.source.failed.conflict",
  codeMismatch: "accountTransfer.source.failed.codeMismatch",
  timeout: "accountTransfer.source.failed.timeout",
  cancelled: "accountTransfer.source.failed.cancelled",
  network: "accountTransfer.source.failed.network",
} satisfies Record<FailureReason, TranslationKey>

const TRANSFER_CODE_LENGTH = 6
const codeGroups = [
  [0, 1, 2],
  [3, 4, 5],
] as const

/**
 * The source half of account/0001: the device with the account shows a QR,
 * takes the code from the device that scanned it, and sends the account. The
 * QR stays up beside the code input until it is confirmed, so the owner's own
 * phone can still turn a raced session into a conflict. The session ends on
 * leaving the screen and on an account switch.
 */
export function AccountTransferSourcePage() {
  const { t } = useTranslation()
  const account = useAtomValue(accountAtom)
  const accountVersion = useAtomValue(evoluCounterAtom)
  const { enabled: accessControlOn } = useAccess()
  const { require } = useRequirePermission()
  const [state, setState] = useState<TransferSourceState | null>(null)
  const [code, setCode] = useState("")
  const [now, setNow] = useState(() => Date.now())
  const sessionRef = useRef<TransferSource | null>(null)
  const store = useStore()

  // biome-ignore lint/correctness/useExhaustiveDependencies: a switched account must not keep a session for the old one
  useEffect(
    () => () => {
      sessionRef.current?.cancel()
      sessionRef.current = null
      setState(null)
    },
    [accountVersion]
  )

  const counting = state?.phase === "waiting" || state?.phase === "locked"
  useEffect(() => {
    if (!counting) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [counting])

  const start = async () => {
    if (!(await require("admin", "accountTransfer.source.start"))) return
    // Left or switched account while the PIN prompt was open.
    if (store.get(evoluCounterAtom) !== accountVersion) return
    sessionRef.current?.cancel()
    setCode("")
    setNow(Date.now())
    const payload: TransferPayload = {
      masterKey: account.masterKey,
      accountName: NonEmptyString255(account.name),
      transports: [
        ...new Set(
          account.transports.flatMap(({ url }) => {
            const parsed = WssUrlSchema.safeParse(url)
            return parsed.success ? [parsed.data] : []
          })
        ),
      ].slice(0, 8),
    }
    sessionRef.current = startTransferSource(
      {
        ...createNostrDep(nativeEnv.EXPO_PUBLIC_PAYKY_NOSTR_RELAYS),
        ...createDateDep(),
      },
      { payload, onState: setState }
    )
  }

  const close = () => {
    router.back()
  }

  const qr = (uri: string, size: number) => (
    <YStack
      items="center"
      accessibilityLabel={t("accountTransfer.source.qr.label")}
    >
      <QrCode value={uri} size={size} />
    </YStack>
  )

  return (
    <Screen>
      <ScreenHeader title={t("accountTransfer.source.title")} />

      {state === null ? (
        <YStack gap="3">
          {(
            [
              "accountTransfer.source.step.scan",
              "accountTransfer.source.step.code",
              "accountTransfer.source.step.transfer",
            ] as const
          ).map((label, index) => (
            <Text key={label}>{`${index + 1}. ${t(label)}`}</Text>
          ))}
          <Alert variant="warning" icon={TriangleAlert}>
            <AlertTitle>{t("accountTransfer.source.warning.title")}</AlertTitle>
            <AlertDescription>
              {t("accountTransfer.source.warning.description")}
            </AlertDescription>
          </Alert>
          {accessControlOn ? (
            <Text color="muted-foreground">
              {t("accountTransfer.source.permissions")}
            </Text>
          ) : null}
        </YStack>
      ) : null}

      {state?.phase === "waiting" ? (
        <YStack gap="3" accessibilityLiveRegion="polite">
          {qr(state.uri, 260)}
          <Text>{t("accountTransfer.source.qr.instructions")}</Text>
          <Text fontSize="sm" color="muted-foreground">
            {t("accountTransfer.source.qr.reassurance")}
          </Text>
          <Text color="muted-foreground">
            {t("accountTransfer.source.qr.validFor", {
              time: formatCountdown(state.expiresAt - now),
            })}
          </Text>
          <Text>{t("accountTransfer.source.qr.waiting")}</Text>
        </YStack>
      ) : null}

      {state?.phase === "locked" ? (
        <YStack gap="3" accessibilityLiveRegion="polite">
          {state.uri !== null ? qr(state.uri, 160) : null}
          <Text fontWeight="600">
            {t("accountTransfer.source.code.connected")}
          </Text>
          <Field>
            <FieldLabel>
              {t("accountTransfer.source.code.instructions")}
            </FieldLabel>
            {/* No auto-submit on the sixth digit: a typo would spend one of
                three attempts. No one-time-code autofill either. */}
            <InputOTP
              value={code}
              maxLength={TRANSFER_CODE_LENGTH}
              autoFocus
              accessibilityLabel={t("accountTransfer.source.code.label")}
              onChange={(next) => setCode(next.replace(/\D/gu, ""))}
            >
              {codeGroups.map((group, index) => (
                <Fragment key={group.join()}>
                  {index > 0 ? <InputOTPSeparator /> : null}
                  <InputOTPGroup>
                    {group.map((slot, position) => (
                      <InputOTPSlot
                        key={slot}
                        index={slot}
                        first={position === 0}
                        last={position === group.length - 1}
                        invalid={state.mismatch}
                        size="lg"
                      />
                    ))}
                  </InputOTPGroup>
                </Fragment>
              ))}
            </InputOTP>
            <FieldDescription>
              {t("accountTransfer.source.code.warning")}
            </FieldDescription>
            <FieldError>
              {state.mismatch
                ? t("accountTransfer.source.code.mismatch", {
                    count: state.attemptsLeft,
                  })
                : undefined}
            </FieldError>
          </Field>
          <AppButton
            label={t("accountTransfer.source.code.confirm")}
            disabled={code.length !== TRANSFER_CODE_LENGTH}
            onPress={() => {
              sessionRef.current?.submitCode(code)
              // A mismatch starts the next attempt from an empty input.
              setCode("")
            }}
          />
        </YStack>
      ) : null}

      {state?.phase === "expired" ? (
        <Text accessibilityLiveRegion="polite">
          {t("accountTransfer.source.qr.expired")}
        </Text>
      ) : null}

      {state?.phase === "sending" ? (
        <Text accessibilityLiveRegion="polite">
          {t("accountTransfer.source.sending")}
        </Text>
      ) : null}

      {state?.phase === "done" ? (
        <YStack gap="2" accessibilityLiveRegion="polite">
          <Text fontWeight="600">{t("accountTransfer.source.done.title")}</Text>
          <Text>
            {t(
              state.acked
                ? "accountTransfer.source.done.acked"
                : "accountTransfer.source.done.sent"
            )}
            {accessControlOn
              ? ` ${t("accountTransfer.source.permissions")}`
              : ""}
          </Text>
        </YStack>
      ) : null}

      {state?.phase === "failed" ? (
        <Alert variant="destructive" icon={TriangleAlert}>
          <AlertTitle>{t("accountTransfer.source.failed.title")}</AlertTitle>
          <AlertDescription>
            {`${t(failureKeys[state.reason])} ${t("accountTransfer.source.failed.nothingSent")}`}
          </AlertDescription>
        </Alert>
      ) : null}

      {state === null ? (
        <>
          <AppButton
            label={t("accountTransfer.source.start")}
            onPress={() => {
              void start()
            }}
          />
          <AppButton
            label={t("accountTransfer.cancel")}
            variant="secondary"
            onPress={close}
          />
        </>
      ) : null}
      {state?.phase === "waiting" || state?.phase === "locked" ? (
        <AppButton
          label={t("accountTransfer.cancel")}
          variant="secondary"
          onPress={close}
        />
      ) : null}
      {state?.phase === "expired" ? (
        <AppButton
          label={t("accountTransfer.source.qr.renew")}
          onPress={() => {
            void start()
          }}
        />
      ) : null}
      {state?.phase === "failed" ? (
        <>
          <AppButton
            label={t("accountTransfer.source.startAgain")}
            onPress={() => {
              void start()
            }}
          />
          <AppButton
            label={t("accountTransfer.close")}
            variant="secondary"
            onPress={close}
          />
        </>
      ) : null}
      {state?.phase === "done" ? (
        <AppButton label={t("accountTransfer.done")} onPress={close} />
      ) : null}
    </Screen>
  )
}
