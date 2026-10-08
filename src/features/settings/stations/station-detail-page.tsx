import { Capacitor } from "@capacitor/core"
import { useShare, useTimeAgo } from "@dedalik/use-react"
import { useAtomValue } from "jotai"
import { BanIcon, CopyIcon, QrCodeIcon, Share2Icon } from "lucide-react"
import { useId, useMemo, useState } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { CopyableQrCode } from "@/components/copyable-qr-code.tsx"
import { FadeHeader } from "@/components/fade-header.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  cashRegisterAccountQuery,
  fiatBankAccountQuery,
  sparkAccountQuery,
} from "@/core/modules/account/account-queries.ts"
import {
  renameStation,
  revokeStation,
  setStationPaymentMethods,
} from "@/core/modules/station/station-actions.ts"
import { getStationCommsPubkey } from "@/core/modules/station/station-identity-utils.ts"
import {
  encodeStationLink,
  resolveStationLinkOrigin,
} from "@/core/modules/station/station-link-utils.ts"
import {
  type StationListRow,
  stationByIdQuery,
} from "@/core/modules/station/station-queries.ts"
import { StationId } from "@/core/modules/station/station-types.ts"
import { requiredTextCodec } from "@/features/settings/inline-edit-codecs.ts"
import { InlineEditField } from "@/features/settings/inline-edit-field.tsx"
import { InlineEditSwitch } from "@/features/settings/inline-edit-switch.tsx"
import { SettingsFormEmptyState } from "@/features/settings/settings-form-empty-state.tsx"
import {
  StationWarnings,
  useStationChainWarnings,
  useStationReportStatus,
} from "@/features/shared/station-report-status.tsx"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConfirmDialog } from "@/hooks/use-confirm-dialog.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useRunToast } from "@/hooks/use-run-toast.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { copyToClipboard } from "@/lib/clipboard.ts"

export function StationDetailPage({
  stationId,
}: {
  readonly stationId: string
}) {
  const parsedId = StationId.safeParse(stationId)

  if (!parsedId.success) {
    return (
      <SettingsFormEmptyState
        titleKey="settings.stations.detail.title"
        messageKey="settings.stations.detail.notFound"
      />
    )
  }

  return <StationDetailContent stationId={parsedId.data} />
}

function StationDetailContent({
  stationId,
}: {
  readonly stationId: StationId
}) {
  const [station] = useEvoluQuery(stationByIdQuery(stationId)).data

  if (station === undefined) {
    return (
      <SettingsFormEmptyState
        titleKey="settings.stations.detail.title"
        messageKey="settings.stations.detail.notFound"
      />
    )
  }

  const revoked = station.revokedAt !== null

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={station.name} />
      <div className="flex flex-col gap-5">
        <StationDetailsCard station={station} />
        {revoked ? null : <StationLinkCard station={station} />}
        <StationStatusCard station={station} />
        <StationPaymentMethodsCard station={station} />
        {revoked ? null : <RevokeStationButton station={station} />}
      </div>
    </>
  )
}

function StationDetailsCard({ station }: { readonly station: StationListRow }) {
  const { t } = useTranslation()
  const appRun = useAppRun()
  const formId = useId()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.stations.detail.card.title")}</CardTitle>
        {station.revokedAt === null ? null : (
          <CardAction>
            <Badge variant="destructive">
              {t("settings.stations.revoked")}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <InlineEditField
            label={t("settings.stations.name.label")}
            placeholder={t("settings.stations.name.placeholder")}
            defaultValue={station.name}
            codec={requiredTextCodec}
            errorKey="settings.stations.name.invalid"
            onSave={async (name) => {
              await using run = appRun()
              await run.ok(renameStation({ id: station.id, name }))
            }}
          />
          <Field>
            <FieldLabel htmlFor={`${formId}-number`}>
              {t("settings.stations.number.label")}
            </FieldLabel>
            <Input
              id={`${formId}-number`}
              value={station.number}
              disabled
              readOnly
            />
            <FieldDescription>
              {t("settings.stations.number.description")}
            </FieldDescription>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

function StationLinkCard({ station }: { readonly station: StationListRow }) {
  const { t } = useTranslation()
  const { masterKey } = useAtomValue(accountAtom)
  const { isSupported: canShare, share } = useShare()
  const [qrShown, setQrShown] = useState(false)
  // A key derivation: not worth redoing on every render.
  const ownerPubkey = useMemo(
    () => getStationCommsPubkey(masterKey),
    [masterKey]
  )
  const link = encodeStationLink({
    origin: resolveStationLinkOrigin({
      isNativePlatform: Capacitor.isNativePlatform(),
      locationOrigin: window.location.origin,
    }),
    masterKey: station.masterKey,
    ownerPubkey,
  })
  const copyMessages = {
    copied: t("settings.stations.link.copied"),
    failed: t("settings.stations.link.copyFailed"),
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.stations.link.title")}</CardTitle>
        <CardDescription>
          {t("settings.stations.link.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="break-all rounded-lg border bg-muted/30 p-3 font-mono text-xs">
          {link}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void copyToClipboard(link, copyMessages)}
          >
            <CopyIcon data-icon="inline-start" />
            {t("settings.stations.link.copy")}
          </Button>
          {canShare ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void share({ title: station.name, url: link })}
            >
              <Share2Icon data-icon="inline-start" />
              {t("settings.stations.link.share")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            aria-expanded={qrShown}
            onClick={() => {
              setQrShown(!qrShown)
            }}
          >
            <QrCodeIcon data-icon="inline-start" />
            {t(
              qrShown
                ? "settings.stations.link.hideQr"
                : "settings.stations.link.showQr"
            )}
          </Button>
        </div>
        {qrShown ? (
          <div className="mx-auto w-full max-w-72">
            <CopyableQrCode
              state="ready"
              value={link}
              ariaLabel={t("settings.stations.link.qrAria")}
              copiedMessage={copyMessages.copied}
              copyFailedMessage={copyMessages.failed}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function StationStatusCard({ station }: { readonly station: StationListRow }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { lastReportAt, chain } = useStationReportStatus(station)
  const warnings = useStationChainWarnings(chain)
  const lastSeen = useTimeAgo(station.lastSeenAt, { locale })
  const lastReport = useTimeAgo(lastReportAt, { locale })
  const configDelivered =
    station.configHash !== null &&
    station.ackedConfigHash === station.configHash

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.stations.status.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <StatusRow
          label={t("settings.stations.status.config")}
          value={t(
            configDelivered
              ? "settings.stations.status.config.delivered"
              : "settings.stations.status.config.pending"
          )}
        />
        <StatusRow
          label={t("settings.stations.status.lastSeen")}
          value={
            station.lastSeenAt === null
              ? t("settings.stations.status.never")
              : lastSeen
          }
        />
        <StatusRow
          label={t("settings.stations.status.lastReport")}
          value={
            lastReportAt === null
              ? t("settings.stations.status.never")
              : lastReport
          }
        />
        <StationWarnings warnings={warnings} />
      </CardContent>
    </Card>
  )
}

function StatusRow({
  label,
  value,
}: {
  readonly label: string
  readonly value: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

function StationPaymentMethodsCard({
  station,
}: {
  readonly station: StationListRow
}) {
  const { t } = useTranslation()
  const appRun = useAppRun()
  const [cash] = useEvoluQuery(cashRegisterAccountQuery).data
  const [bank] = useEvoluQuery(fiatBankAccountQuery).data
  const [spark] = useEvoluQuery(sparkAccountQuery).data
  const revoked = station.revokedAt !== null

  const methods = [
    {
      key: "cash",
      toInput: (checked: boolean) => ({ cash: checked }),
      label: t("settings.paymentAccounts.method.cashRegister"),
      enabled: station.cashEnabled === 1,
      available: cash !== undefined && cash.isDeleted !== 1,
    },
    {
      key: "iban",
      toInput: (checked: boolean) => ({ iban: checked }),
      label: t("settings.paymentAccounts.method.iban"),
      enabled: station.ibanEnabled === 1,
      available: bank !== undefined && bank.isDeleted !== 1,
    },
    {
      key: "spark",
      toInput: (checked: boolean) => ({ spark: checked }),
      label: t("settings.paymentAccounts.method.spark"),
      enabled: station.sparkEnabled === 1,
      available: spark !== undefined && spark.isDeleted !== 1,
    },
  ] as const

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.stations.methods.title")}</CardTitle>
        <CardDescription>
          {t("settings.stations.methods.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {methods.map((method) => (
            <InlineEditSwitch
              key={method.key}
              label={method.label}
              description={
                method.available
                  ? undefined
                  : t("settings.stations.methods.notSetUp")
              }
              defaultValue={method.enabled && method.available}
              disabled={revoked || !method.available}
              onSave={async (checked) => {
                await using run = appRun()
                await run.ok(
                  setStationPaymentMethods({
                    id: station.id,
                    ...method.toInput(checked),
                  })
                )
              }}
            />
          ))}
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

function RevokeStationButton({
  station,
}: {
  readonly station: StationListRow
}) {
  const { t } = useTranslation()
  const confirm = useConfirmDialog()
  const runToast = useRunToast()

  // Not `useConfirmedRun`: `revokeStation` also needs the clock.
  const handleRevoke = async () => {
    const confirmed = await confirm({
      title: t("settings.stations.revoke.confirm.title", {
        name: station.name,
      }),
      description: t("settings.stations.revoke.confirm.description"),
      confirmLabel: t("settings.stations.revoke.confirm.confirm"),
      cancelLabel: t("settings.stations.revoke.confirm.cancel"),
      variant: "destructive",
    })
    if (!confirmed) return

    await runToast(async (run) => {
      await run.ok(revokeStation(station.id))
    })
  }

  return (
    <Button variant="destructive" onClick={() => void handleRevoke()}>
      <BanIcon data-icon="inline-start" />
      {t("settings.stations.revoke")}
    </Button>
  )
}
