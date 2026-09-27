import { useAtomValue } from "jotai"
import { ChevronDownIcon, PlugZapIcon, ReceiptIcon } from "lucide-react"
import { useState } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx"
import type {
  EetDeliveryOutcome,
  EetSubmission,
} from "@/core/integrations/eet/eet-client.ts"
import { sendEetTestMessage } from "@/core/modules/eet/eet-actions.ts"
import type {
  EetConfigurationGap,
  EetEnvironment,
} from "@/core/modules/eet/eet-types.ts"
import { useRunToast } from "@/hooks/use-run-toast.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { cn } from "@/lib/utils.ts"

type EetTestKind = "verification" | "sale"

const outcomeTitleKeys = {
  accepted: "settings.eet.test.outcome.accepted",
  verified: "settings.eet.test.outcome.verified",
  retry: "settings.eet.test.outcome.failed",
  rejected: "settings.eet.test.outcome.failed",
} satisfies Record<EetDeliveryOutcome["type"], TranslationKey>

export function EetTestCard({
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
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.eet.test.title")}</CardTitle>
        <CardDescription>{t("settings.eet.test.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!canSend}
            onClick={() => void send("verification")}
          >
            <PlugZapIcon data-icon="inline-start" />
            {t("settings.eet.test.connection")}
          </Button>
          {environment === "playground" ? (
            <Button
              type="button"
              variant="outline"
              disabled={!canSend}
              onClick={() => void send("sale")}
            >
              <ReceiptIcon data-icon="inline-start" />
              {t("settings.eet.test.sale")}
            </Button>
          ) : null}
        </div>
        {submission === null ? null : <EetTestResult submission={submission} />}
      </CardContent>
    </Card>
  )
}

function EetTestResult({ submission }: { readonly submission: EetSubmission }) {
  const { t } = useTranslation()
  const { outcome } = submission
  const isSuccess = outcome.type === "accepted" || outcome.type === "verified"

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border p-3"
      data-testid="eet-test-result"
    >
      <p
        className={cn(
          "text-sm font-semibold",
          isSuccess ? "text-success" : "text-destructive"
        )}
      >
        {t(outcomeTitleKeys[outcome.type])}
      </p>
      {outcome.type === "accepted" ? (
        <p className="break-all font-mono text-xs" data-testid="eet-test-pok">
          {t("settings.eet.test.pok", { pok: outcome.pok })}
        </p>
      ) : null}
      {outcome.type === "retry" || outcome.type === "rejected" ? (
        <p className="text-sm">
          {outcome.code === null
            ? outcome.message
            : t("settings.eet.test.errorCode", {
                code: String(outcome.code),
                message: outcome.message,
              })}
        </p>
      ) : null}
      <EetRawMessage
        label={t("settings.eet.test.rawRequest")}
        value={submission.rawRequest}
      />
      <EetRawMessage
        label={t("settings.eet.test.rawResponse")}
        value={submission.rawResponse}
      />
    </div>
  )
}

function EetRawMessage({
  label,
  value,
}: {
  readonly label: string
  readonly value: string | null
}) {
  if (value === null) return null

  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {label}
        <ChevronDownIcon
          aria-hidden
          className="size-3.5 transition-transform group-data-panel-open:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] whitespace-pre-wrap break-all">
          {value}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  )
}
