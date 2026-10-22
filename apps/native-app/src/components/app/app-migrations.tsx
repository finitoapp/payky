import { useAtomValue } from "jotai"
import { unwrap } from "jotai/utils"
import { useState } from "react"
import { ActivityIndicator } from "react-native"
import { useTheme, View } from "tamagui"
import {
  type AppMigrationReport,
  appMigrationsAtom,
  pendingAppMigrationsAtom,
} from "../../atoms/app-migrations.ts"
import { deviceMigrationsAtom } from "../../atoms/device-migrations.ts"
import { useFirstScreenReady } from "../../core/first-screen.ts"
import { useTranslation } from "../../hooks/use-translation.ts"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog.tsx"

/** `undefined` while the migrations run. */
const appMigrationsReportAtom = unwrap(appMigrationsAtom)

/**
 * Web's `AppMigrations`: reports the data migrations of this start in a
 * modal the user dismisses — running, then success or failure. The device
 * database's migrations have already run (`deviceMigrationsAtom`); their
 * outcome joins this one report.
 *
 * Unlike web it does not wrap the background jobs: they already wait on
 * `appMigrationsAtom`, which this reads and so starts at app start, as web
 * does. Nothing renders while the pending check runs (it suspends), which is
 * the path every ordinary start takes; the dialog appears only when there was
 * something to migrate, and not before the splash is gone. Failures go to the
 * console, not Sentry: a handled failure with its own UI.
 */
export function AppMigrations() {
  const { t } = useTranslation()
  const theme = useTheme()
  const firstScreenReady = useFirstScreenReady()
  const pending = useAtomValue(pendingAppMigrationsAtom)
  const report = useAtomValue(appMigrationsReportAtom)
  const deviceReport = useAtomValue(deviceMigrationsAtom)
  // The report the user closed, so an account switch's new run opens it again.
  const [dismissed, setDismissed] = useState<AppMigrationReport | null>(null)

  const settled = report ?? null
  const isRunning =
    report === undefined && pending !== null && pending.length > 0
  const hasFailed = settled?.failed === true || deviceReport.failed
  const migrated = (settled?.migrated ?? 0) + deviceReport.migrated
  const hasReport =
    settled !== null && settled !== dismissed && (hasFailed || migrated > 0)

  return (
    <AlertDialog
      open={firstScreenReady && (isRunning || hasReport)}
      onOpenChange={(open) => {
        // Back routes through here too, so this is also what keeps the
        // dialog up for the whole run: there is nothing to decide until then.
        if (!open && !isRunning) setDismissed(settled)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isRunning
              ? t("migration.running.title")
              : hasFailed
                ? t("migration.failed.title")
                : t("migration.success.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isRunning
              ? t("migration.running.description")
              : hasFailed
                ? t("migration.failed.description")
                : t("migration.success.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {isRunning ? (
          <View items="center" py="2" aria-hidden>
            <ActivityIndicator color={theme["muted-foreground"]?.val} />
          </View>
        ) : (
          <AlertDialogFooter>
            <AlertDialogAction
              size="lg"
              label={t("migration.close")}
              onPress={() => setDismissed(settled)}
            />
          </AlertDialogFooter>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
