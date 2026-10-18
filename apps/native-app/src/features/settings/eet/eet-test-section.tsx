import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import type {
  EetDeliveryOutcome,
  EetSubmission,
} from "@payky/core/integrations/eet/eet-client"
import { sendEetTestMessage } from "@payky/core/modules/eet/eet-actions"
import type {
  EetConfigurationGap,
  EetEnvironment,
} from "@payky/core/modules/eet/eet-types"
import { useAtomValue } from "jotai"
import { useState } from "react"
import { Text, YStack } from "tamagui"
import { accountAtom } from "../../../atoms/account.ts"
import { AppButton } from "../../../components/app-button.tsx"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

type EetTestKind = "verification" | "sale"

const outcomeTitleKeys = {
  accepted: "settings.eet.test.outcome.accepted",
  verified: "settings.eet.test.outcome.verified",
  retry: "settings.eet.test.outcome.failed",
  rejected: "settings.eet.test.outcome.failed",
} satisfies Record<EetDeliveryOutcome["type"], TranslationKey>

/**
 * Sends a verification or (sandbox only) a test sale and shows what EET
 * answered. Never touches a real sale, so a failure here cannot block checkout.
 */
export function EetTestSection({
  environment,
  gaps,
}: {
  readonly environment: EetEnvironment
  readonly gaps: ReadonlyArray<EetConfigurationGap>
}) {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const deviceId = useAtomValue(accountAtom).device.id
  const [pending, setPending] = useState(false)
  const [submission, setSubmission] = useState<EetSubmission | null>(null)
  const canSend = gaps.length === 0 && !pending

  const send = async (kind: EetTestKind) => {
    setPending(true)
    setSubmission(null)
    await runToast(async (run) => {
      const result = await run(sendEetTestMessage({ kind, deviceId }))
      if (!result.ok) return "settings.eet.test.unavailable"
      setSubmission(result.value)
      return undefined
    })
    setPending(false)
  }

  return (
    <YStack gap="3">
      <YStack gap="1">
        <Text fontWeight="700">{t("settings.eet.test.title")}</Text>
        <Text color="muted-foreground">
          {t("settings.eet.test.description")}
        </Text>
      </YStack>
      <AppButton
        label={t("settings.eet.test.connection")}
        variant="secondary"
        disabled={!canSend}
        pending={pending}
        onPress={() => {
          void send("verification")
        }}
      />
      {environment === "playground" ? (
        <AppButton
          label={t("settings.eet.test.sale")}
          variant="secondary"
          disabled={!canSend}
          onPress={() => {
            void send("sale")
          }}
        />
      ) : null}
      {submission === null ? null : <EetTestResult submission={submission} />}
    </YStack>
  )
}

function EetTestResult({ submission }: { readonly submission: EetSubmission }) {
  const { t } = useTranslation()
  const { outcome } = submission
  const isSuccess = outcome.type === "accepted" || outcome.type === "verified"

  return (
    <YStack
      gap="2"
      p="3"
      rounded="lg"
      borderWidth={1}
      borderColor="border-color"
      testID="eet-test-result"
    >
      <Text fontWeight="700" color={isSuccess ? "green-600" : "red-600"}>
        {t(outcomeTitleKeys[outcome.type])}
      </Text>
      {outcome.type === "accepted" ? (
        <Text fontSize={12} testID="eet-test-pok">
          {t("settings.eet.test.pok", { pok: outcome.pok })}
        </Text>
      ) : null}
      {outcome.type === "retry" || outcome.type === "rejected" ? (
        <Text>
          {outcome.code === null
            ? outcome.message
            : t("settings.eet.test.errorCode", {
                code: String(outcome.code),
                message: outcome.message,
              })}
        </Text>
      ) : null}
      <RawMessage
        label={t("settings.eet.test.rawRequest")}
        value={submission.rawRequest}
      />
      <RawMessage
        label={t("settings.eet.test.rawResponse")}
        value={submission.rawResponse}
      />
    </YStack>
  )
}

/** A collapsed XML message, selectable once opened. */
function RawMessage({
  label,
  value,
}: {
  readonly label: string
  readonly value: string | null
}) {
  const [open, setOpen] = useState(false)
  if (value === null) return null

  return (
    <YStack gap="1">
      <Text
        fontSize={13}
        fontWeight="600"
        color="muted-foreground"
        accessibilityRole="button"
        onPress={() => setOpen((current) => !current)}
      >
        {`${open ? "▾" : "▸"} ${label}`}
      </Text>
      {open ? (
        <Text fontSize={11} userSelect="text">
          {value}
        </Text>
      ) : null}
    </YStack>
  )
}
