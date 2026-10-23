import {
  type QerkoTerminalChoice,
  selectableQerkoLocations,
} from "@payky/app-shared/qerko-terminal-flow"
import { selectQerkoTerminal } from "@payky/core/evolu/device-qerko"
import { getQerkoTerminals } from "@payky/core/integrations/qerko/qerko-client"
import { saveQerkoTerminalAccount } from "@payky/core/modules/account/account-actions"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import { getFiatCurrency } from "@payky/core/modules/app-settings/app-settings-utils"
import { qerkoPluginQuery } from "@payky/core/modules/qerko-plugin/qerko-plugin-queries"
import { NonEmptyString255Schema } from "@payky/core/modules/shared/schema"
import { useQuery } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { LoaderCircle } from "lucide-react"
import { accountAtom } from "@/atoms/account.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useRunToast } from "@/hooks/use-run-toast.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * The terminals Qerko lists for the paired company, grouped by location;
 * choosing one makes it this device's terminal (qerko/0001). The choice is
 * written to the device database, so it never syncs.
 */
export function QerkoTerminalChooser({
  enableAccount = false,
  onChosen,
}: {
  /** Also turns the payment method on, as the end of first-time pairing does. */
  readonly enableAccount?: boolean
  readonly onChosen: () => void
}) {
  const { t } = useTranslation()
  const appRun = useAppRun()
  const runToast = useRunToast()
  const account = useAtomValue(accountAtom)
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const { data: pluginData } = useEvoluQuery(qerkoPluginQuery)
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const [plugin] = pluginData
  const [settings] = settingsData

  const terminals = useQuery({
    queryKey: ["qerko", "terminals", plugin?.environment, plugin?.apiKeyName],
    enabled: plugin !== undefined,
    // A terminal activated in Qerko a moment ago must show up on reopening.
    gcTime: 0,
    queryFn: async () => {
      if (plugin === undefined) return []
      await using run = appRun()
      const result = await run(
        getQerkoTerminals({
          apiKey: plugin.apiKey,
          environment: plugin.environment,
        })
      )
      if (!result.ok) throw new Error(result.error.type)
      return selectableQerkoLocations(result.value)
    },
  })

  const choose = async (terminal: QerkoTerminalChoice) => {
    const terminalId = NonEmptyString255Schema.safeParse(terminal.terminalId)
    const terminalTid = NonEmptyString255Schema.safeParse(terminal.tid)
    const locationName = NonEmptyString255Schema.safeParse(
      terminal.locationName
    )
    if (!terminalId.success || !terminalTid.success || !locationName.success) {
      return
    }

    selectQerkoTerminal(deviceEvolu, {
      accountId: account.id,
      terminalId: terminalId.data,
      terminalTid: terminalTid.data,
      locationName: locationName.data,
    })
    if (enableAccount) {
      const saved = await runToast(async (run) => {
        await run.ok(
          saveQerkoTerminalAccount({
            enabled: true,
            currency: getFiatCurrency(settings),
          })
        )
      })
      if (!saved) return
    }
    onChosen()
  }

  if (terminals.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
      </p>
    )
  }

  if (terminals.isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-destructive">
          {t("settings.qerkoTerminal.terminals.failed")}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void terminals.refetch()
          }}
        >
          {t("settings.qerkoTerminal.terminals.retry")}
        </Button>
      </div>
    )
  }

  if (terminals.data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("settings.qerkoTerminal.terminals.empty")}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {terminals.data.map((location) => (
        <section key={location.locationId} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{location.locationName}</h3>
          <ul className="flex flex-col gap-2">
            {location.terminals.map((terminal) => (
              <li
                key={terminal.terminalId}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <span className="flex min-w-0 flex-col gap-1 text-sm">
                  <span className="font-mono">{terminal.tid}</span>
                  <Badge variant="secondary" className="w-fit">
                    {t(
                      terminal.platform === "softPos"
                        ? "settings.qerkoTerminal.terminals.platform.softPos"
                        : "settings.qerkoTerminal.terminals.platform.physical"
                    )}
                  </Badge>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void choose(terminal)
                  }}
                >
                  {t("settings.qerkoTerminal.terminals.choose")}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
