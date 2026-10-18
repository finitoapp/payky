import { sqliteTrue } from "@evolu/common"
import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { useNow } from "@payky/app-shared/use-now"
import {
  disableEet,
  type EetProductionUnavailableError,
  type EetTestCertificateBlocksProductionError,
  enableEet,
  saveEetEstablishmentId,
  saveEetTipOwner,
  selectEetEnvironment,
} from "@payky/core/modules/eet/eet-actions"
import {
  type EetConfigurationGap,
  type EetEnvironment,
  type EetEstablishmentId,
  EetEstablishmentIdSchema,
  type EetTipOwner,
} from "@payky/core/modules/eet/eet-types"
import {
  deriveEetCertificateExpiry,
  findEetConfigurationGaps,
} from "@payky/core/modules/eet/eet-utils"
import { Switch } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { z } from "zod"
import { InlineEditField } from "../../../components/inline-edit-field.tsx"
import { OptionSelect } from "../../../components/option-select.tsx"
import { Screen } from "../../../components/screen.tsx"
import { ScreenHeader } from "../../../components/screen-header.tsx"
import { useConfirm } from "../../../hooks/use-confirm.ts"
import { useInlineChoice } from "../../../hooks/use-inline-choice.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useToast } from "../../../hooks/use-toast.ts"
import { useLocale, useTranslation } from "../../../hooks/use-translation.ts"
import { useEetSettings } from "../../shared/use-eet-settings.ts"
import { WarningPanel } from "../../shared/warning-panel.tsx"
import { EetCertificateImport } from "./eet-certificate-import.tsx"
import { EetOfficialTestCertificates } from "./eet-official-test-certificates.tsx"
import { EetTestSection } from "./eet-test-section.tsx"
import { EetUnconfirmedSales } from "./eet-unconfirmed-sales.tsx"

const establishmentIdCodec = z.codec(
  z.string(),
  EetEstablishmentIdSchema.nullable(),
  {
    decode: (value) => value.trim(),
    encode: (value) => value ?? "",
  }
)

const configurationGapKeys = {
  certificate: "settings.eet.gap.certificate",
  certificateExpired: "settings.eet.gap.certificateExpired",
  establishment: "settings.eet.gap.establishment",
} satisfies Record<EetConfigurationGap, TranslationKey>

const environmentErrorKeys = {
  EetProductionUnavailableError:
    "settings.eet.environment.productionUnavailable",
  EetTestCertificateBlocksProductionError:
    "settings.eet.environment.testCertificateBlocksProduction",
} satisfies Record<
  (
    | EetProductionUnavailableError
    | EetTestCertificateBlocksProductionError
  )["type"],
  TranslationKey
>

/**
 * EET configuration (A03b): reporting, tip owner, environment and the stored
 * certificate's state. The certificate import, test and unconfirmed sales
 * (A03a, A03c, A03d) are sections of the same screen.
 */
export function EetSettingsPage() {
  const { t } = useTranslation()
  const eet = useEetSettings()
  const now = useNow([eet.settings?.validTo ?? null])
  const gaps = findEetConfigurationGaps({
    validTo: eet.settings?.validTo ?? null,
    establishmentId: eet.settings?.establishmentId ?? null,
    now,
  })

  return (
    <Screen>
      <ScreenHeader title={t("settings.eet.title")} />
      <ReportingSection
        establishmentId={eet.settings?.establishmentId ?? null}
        isEnabled={eet.isEnabled}
        gaps={gaps}
      />
      <TipSection tipOwner={eet.tipOwner} />
      <EnvironmentSection
        environment={eet.environment}
        isProductionAvailable={eet.isProductionAvailable}
        isTestCertificate={eet.isTestCertificate}
      />
      <StoredCertificate environment={eet.environment} />
      <EetTestSection environment={eet.environment} gaps={gaps} />
      <Section
        title={t("settings.eet.unconfirmed.title")}
        description={t("settings.eet.unconfirmed.description")}
      >
        <EetUnconfirmedSales />
      </Section>
    </Screen>
  )
}

function Section({
  title,
  description,
  children,
}: {
  readonly title: string
  readonly description: string
  readonly children: React.ReactNode
}) {
  return (
    <YStack gap="3">
      <YStack gap="1">
        <Text fontWeight="700">{title}</Text>
        <Text color="muted-foreground">{description}</Text>
      </YStack>
      {children}
    </YStack>
  )
}

function ReportingSection({
  establishmentId,
  isEnabled,
  gaps,
}: {
  readonly establishmentId: EetEstablishmentId | null
  readonly isEnabled: boolean
  readonly gaps: ReadonlyArray<EetConfigurationGap>
}) {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const cannotEnable = !isEnabled && gaps.length > 0
  const enabled = useInlineChoice(isEnabled, (checked) =>
    runToast(async (run) => {
      if (!checked) {
        await run.ok(disableEet())
        return undefined
      }
      const result = await run(enableEet())
      return result.ok ? undefined : "settings.eet.enabled.incomplete"
    })
  )

  return (
    <Section
      title={t("settings.eet.reporting.title")}
      description={t("settings.eet.reporting.description")}
    >
      <InlineEditField
        label={t("settings.eet.establishment.label")}
        description={t("settings.eet.establishment.description")}
        keyboardType="number-pad"
        defaultValue={establishmentId}
        codec={establishmentIdCodec}
        errorKey="settings.eet.establishment.invalid"
        onSave={(next) =>
          runToast(async (run) => {
            if (next === null) return undefined
            await run.ok(saveEetEstablishmentId(next))
          })
        }
      />
      <XStack gap="3" items="center">
        <Switch
          accessibilityLabel={t("settings.eet.enabled.label")}
          value={enabled.value}
          disabled={cannotEnable || enabled.saving}
          onValueChange={(checked) => {
            void enabled.choose(checked)
          }}
        />
        <YStack flex={1}>
          <Text fontWeight="600">{t("settings.eet.enabled.label")}</Text>
          <Text fontSize={13} color="muted-foreground">
            {cannotEnable
              ? t("settings.eet.enabled.missing", {
                  missing: gaps
                    .map((gap) => t(configurationGapKeys[gap]))
                    .join(", "),
                })
              : t("settings.eet.enabled.description")}
          </Text>
        </YStack>
      </XStack>
    </Section>
  )
}

function TipSection({ tipOwner }: { readonly tipOwner: EetTipOwner }) {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const choice = useInlineChoice(tipOwner, (next) =>
    runToast(async (run) => {
      await run.ok(saveEetTipOwner(next))
    })
  )

  return (
    <Section
      title={t("settings.eet.tip.title")}
      description={t("settings.eet.tip.description")}
    >
      <OptionSelect<EetTipOwner>
        value={choice.value}
        options={[
          {
            value: "business",
            title: t("settings.eet.tip.business.title"),
            description: t("settings.eet.tip.business.description"),
          },
          {
            value: "employees",
            title: t("settings.eet.tip.employees.title"),
            description: t("settings.eet.tip.employees.description"),
          },
        ]}
        onChange={(next) => {
          void choice.choose(next)
        }}
      />
      <Text fontSize={13} color="muted-foreground">
        {t("settings.eet.tip.note")}
      </Text>
    </Section>
  )
}

function EnvironmentSection({
  environment,
  isProductionAvailable,
  isTestCertificate,
}: {
  readonly environment: EetEnvironment
  readonly isProductionAvailable: boolean
  readonly isTestCertificate: boolean
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const runToast = useRunToast()
  const toast = useToast()
  const choice = useInlineChoice(environment, async (next) => {
    if (next === "playground") {
      const confirmed = await confirm({
        title: t("settings.eet.environment.sandboxConfirm.title"),
        description: t("settings.eet.environment.sandboxConfirm.description"),
        confirmLabel: t("settings.eet.environment.sandboxConfirm.confirm"),
        cancelLabel: t("settings.eet.environment.sandboxConfirm.cancel"),
      })
      if (!confirmed) return false
    }
    const saved = await runToast(async (run) => {
      const result = await run(selectEetEnvironment(next))
      return result.ok ? undefined : environmentErrorKeys[result.error.type]
    })
    if (saved) toast.success(t("settings.eet.environment.saved"))
    return saved
  })

  const productionDescription = !isProductionAvailable
    ? t("settings.eet.environment.productionUnavailable")
    : isTestCertificate
      ? t("settings.eet.environment.testCertificateBlocksProduction")
      : t("settings.eet.environment.production.description")

  return (
    <Section
      title={t("settings.eet.environment.title")}
      description={t("settings.eet.environment.description")}
    >
      <OptionSelect<EetEnvironment>
        value={choice.value}
        options={[
          {
            value: "production",
            title: t("settings.eet.environment.production.title"),
            description: productionDescription,
          },
          {
            value: "playground",
            title: t("settings.eet.environment.playground.title"),
            description: t("settings.eet.environment.playground.description"),
          },
        ]}
        onChange={(next) => {
          void choice.choose(next)
        }}
      />
    </Section>
  )
}

function StoredCertificate({
  environment,
}: {
  readonly environment: EetEnvironment
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { settings } = useEetSettings()
  const validTo = settings?.validTo ?? null
  const now = useNow([validTo])

  return (
    <Section
      title={t("settings.eet.certificate.title")}
      description={t("settings.eet.certificate.description")}
    >
      {settings?.eic === null ||
      settings?.eic === undefined ||
      validTo === null ? (
        <Text color="muted-foreground">
          {t("settings.eet.certificate.none")}
        </Text>
      ) : (
        <StoredCertificateDetails
          eic={settings.eic}
          description={settings.description}
          validTo={validTo}
          isTest={settings.isTestCertificate === sqliteTrue}
          now={now}
          locale={locale}
        />
      )}
      <EetCertificateImport />
      {environment === "playground" ? <EetOfficialTestCertificates /> : null}
    </Section>
  )
}

function StoredCertificateDetails({
  eic,
  description,
  validTo,
  isTest,
  now,
  locale,
}: {
  readonly eic: string
  readonly description: string | null
  readonly validTo: number
  readonly isTest: boolean
  readonly now: Date
  readonly locale: string
}) {
  const { t } = useTranslation()
  const expiry = deriveEetCertificateExpiry({ validTo: new Date(validTo), now })

  return (
    <YStack gap="3">
      <YStack
        gap="1"
        p="3"
        rounded="lg"
        borderWidth={1}
        borderColor="border-color"
      >
        <Text fontSize={12} color="muted-foreground">
          {t("settings.eet.certificate.eic")}
        </Text>
        <Text fontWeight="700" testID="eet-certificate-eic">
          {eic}
        </Text>
        {description === null ? null : (
          <Text fontSize={12} color="muted-foreground">
            {description}
          </Text>
        )}
        <Text fontSize={12} color="muted-foreground">
          {t("settings.eet.certificate.validTo", {
            date: new Intl.DateTimeFormat(locale).format(new Date(validTo)),
          })}
        </Text>
        {isTest ? (
          <Text fontSize={12} fontWeight="600">
            {t("settings.eet.certificate.testBadge")}
          </Text>
        ) : null}
      </YStack>
      {expiry === "valid" ? null : (
        <WarningPanel
          title={t(
            expiry === "expired"
              ? "settings.eet.certificate.expired.title"
              : "settings.eet.certificate.expiresSoon.title"
          )}
        >
          <Text>
            {t(
              expiry === "expired"
                ? "settings.eet.certificate.expired.description"
                : "settings.eet.certificate.expiresSoon.description"
            )}
          </Text>
        </WarningPanel>
      )}
    </YStack>
  )
}
