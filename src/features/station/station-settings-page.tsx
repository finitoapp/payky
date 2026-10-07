import { useSetAtom } from "jotai"
import {
  CloudUploadIcon,
  HistoryIcon,
  Info,
  Languages,
  LogOutIcon,
  StoreIcon,
  SunMoon,
  UserRoundIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { employeePickerOpenAtom } from "@/atoms/employee-picker.ts"
import { FadeHeader } from "@/components/fade-header.tsx"
import { type Theme, useTheme } from "@/components/theme-provider.tsx"
import { Button } from "@/components/ui/button.tsx"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import { activeEmployeesQuery } from "@/core/modules/employee/employee-queries.ts"
import {
  currentEmployeeQuery,
  stationConfigQuery,
  stationOutboxStatusQuery,
} from "@/core/modules/station/station-queries.ts"
import { languageOptions } from "@/features/shared/language-options.ts"
import { useLeaveStation } from "@/features/station/use-leave-station.tsx"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { formatDateTime } from "@/lib/format-utils.ts"

const themeValueKeys = {
  light: "settings.theme.light.title",
  dark: "settings.theme.dark.title",
  system: "settings.theme.system.title",
} satisfies Record<Theme, TranslationKey>

/** A settings row's title with its current value beside it. */
function RowLabel({
  title,
  value,
}: {
  readonly title: string
  readonly value: ReactNode
}) {
  return (
    <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span className="text-sm font-semibold">{title}</span>
      <span className="ml-auto max-w-full truncate text-sm text-muted-foreground">
        {value}
      </span>
    </span>
  )
}

/**
 * The settings a PoS station offers (station/0011): who is selling, whether
 * the owner has its payments, the device's language and theme, and the way
 * out of PoS mode. Everything else is the owner's.
 */
export function StationSettingsPage() {
  const { language, t } = useTranslation()
  const { theme } = useTheme()
  const openEmployeePicker = useSetAtom(employeePickerOpenAtom)
  const leaveStation = useLeaveStation()
  const [config] = useEvoluQuery(stationConfigQuery).data
  const employees = useEvoluQuery(activeEmployeesQuery).data
  const [currentEmployee] = useEvoluQuery(currentEmployeeQuery).data
  const [outbox] = useEvoluQuery(stationOutboxStatusQuery).data
  const undelivered = outbox?.undeliveredPaymentCount ?? 0
  const lastAckedAt = outbox?.lastAckedAt ?? null

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.title")} />

      {config === undefined ? null : (
        <VerticalNav
          items={[
            {
              kind: "static",
              disableAction: true,
              icon: <StoreIcon className="size-5 text-muted-foreground" />,
              label: (
                <RowLabel
                  title={config.name}
                  value={t("station.settings.number", {
                    number: config.number,
                  })}
                />
              ),
            },
          ]}
        />
      )}

      {employees.length > 0 ? (
        <VerticalNav
          items={[
            {
              kind: "button",
              onClick: () => {
                openEmployeePicker(true)
              },
              icon: <UserRoundIcon className="size-5 text-muted-foreground" />,
              label: (
                <RowLabel
                  title={t("station.settings.employee.title")}
                  value={
                    currentEmployee?.name ?? t("station.settings.employee.none")
                  }
                />
              ),
            },
          ]}
        />
      ) : null}

      <VerticalNav
        title={t("station.settings.delivery.title")}
        items={[
          {
            kind: "static",
            disableAction: true,
            icon: <CloudUploadIcon className="size-5 text-muted-foreground" />,
            label: (
              <RowLabel
                title={t(
                  undelivered > 0
                    ? "station.settings.delivery.undelivered"
                    : "station.settings.delivery.allDelivered"
                )}
                value={undelivered > 0 ? undelivered : null}
              />
            ),
          },
          {
            kind: "static",
            disableAction: true,
            icon: <HistoryIcon className="size-5 text-muted-foreground" />,
            label: (
              <RowLabel
                title={t("station.settings.delivery.lastAck")}
                value={
                  lastAckedAt === null
                    ? t("station.settings.delivery.never")
                    : formatDateTime(new Date(lastAckedAt), language)
                }
              />
            ),
          },
        ]}
      />

      <VerticalNav
        title={t("settings.appearance")}
        items={[
          {
            kind: "link",
            to: "/settings/language",
            icon: <Languages className="size-5 text-muted-foreground" />,
            label: (
              <RowLabel
                title={t("settings.language.title")}
                value={
                  languageOptions.find((option) => option.value === language)
                    ?.label
                }
              />
            ),
          },
          {
            kind: "link",
            to: "/settings/theme",
            icon: <SunMoon className="size-5 text-muted-foreground" />,
            label: (
              <RowLabel
                title={t("settings.theme.title")}
                value={t(themeValueKeys[theme])}
              />
            ),
          },
          {
            kind: "link",
            to: "/settings/about",
            icon: <Info className="size-5 text-muted-foreground" />,
            label: <RowLabel title={t("settings.about.title")} value={null} />,
          },
        ]}
      />

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="text-destructive"
        onClick={() => {
          void leaveStation()
        }}
      >
        <LogOutIcon data-icon="inline-start" />
        {t("station.leave.action")}
      </Button>
    </>
  )
}
