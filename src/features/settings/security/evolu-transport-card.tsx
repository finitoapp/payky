import { TransportAddForm } from "@/components/evolu-transports/transport-add-form.tsx"
import { TransportToggleList } from "@/components/evolu-transports/transport-toggle-list.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import type { AccountId } from "@/core/evolu/device-client.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

interface EvoluTransportCardProps {
  readonly accountId: AccountId
}

export function EvoluTransportCard({ accountId }: EvoluTransportCardProps) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.security.transports.title")}</CardTitle>
        <CardDescription>
          {t("settings.security.transports.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-5">
          <TransportToggleList accountId={accountId} />
          <TransportAddForm accountId={accountId} />
        </div>
      </CardContent>
      <CardFooter>
        <p className="text-xs text-muted-foreground">
          {t("settings.security.transports.footer")}
        </p>
      </CardFooter>
    </Card>
  )
}
