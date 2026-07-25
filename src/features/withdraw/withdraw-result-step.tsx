import { Link } from "@tanstack/react-router"
import { CopyIcon, ExternalLinkIcon } from "lucide-react"
import { toast } from "sonner"

import { PaymentSuccess } from "@/components/payment-success.tsx"
import { Button } from "@/components/ui/button.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { WithdrawResult } from "./withdraw-flow.ts"

export function WithdrawResultStep({
  result,
}: {
  readonly result: WithdrawResult
}) {
  const { t } = useTranslation()

  const copyTxid = async () => {
    if (!result.txid) return

    try {
      await navigator.clipboard.writeText(result.txid)
      toast.success(t("withdraw.result.copied"))
    } catch {
      toast.error(t("withdraw.result.copyError"))
    }
  }

  return (
    <PaymentSuccess
      title={t("withdraw.result.title")}
      description={t("withdraw.result.description")}
      actions={
        <div className="flex w-full flex-col gap-4">
          <div className="flex flex-col gap-1 rounded-lg border border-border p-3 text-left text-sm">
            <span className="text-muted-foreground">
              {t("withdraw.result.status")}
            </span>
            <span className="font-medium">{result.status}</span>
            {result.txid ? (
              <>
                <span className="mt-2 text-muted-foreground">
                  {t("withdraw.result.txid")}
                </span>
                <span className="break-all font-mono text-xs">
                  {result.txid}
                </span>
              </>
            ) : null}
          </div>
          {result.txid ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => void copyTxid()}
              >
                <CopyIcon />
                {t("withdraw.result.copyTxid")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                nativeButton={false}
                render={
                  <a
                    href={`https://mempool.space/tx/${result.txid}`}
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                <ExternalLinkIcon />
                {t("withdraw.result.viewOnExplorer")}
              </Button>
            </div>
          ) : null}
          <Button
            className="w-full"
            nativeButton={false}
            render={<Link to="/settings" />}
          >
            {t("withdraw.result.done")}
          </Button>
        </div>
      }
    />
  )
}
