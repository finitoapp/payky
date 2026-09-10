import { Link } from "@tanstack/react-router"
import { CopyIcon, ExternalLinkIcon } from "lucide-react"
import { SuccessPanel } from "@/components/success-panel.tsx"
import { Button } from "@/components/ui/button.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"
import { copyToClipboard } from "@/lib/clipboard.ts"
import type { WithdrawResult } from "./withdraw-flow.ts"

export function WithdrawResultStep({
  result,
}: {
  readonly result: WithdrawResult
}) {
  const { t } = useTranslation()
  const { txid } = result

  return (
    <SuccessPanel
      title={t("withdraw.result.title")}
      description={t("withdraw.result.description")}
      actions={
        <div className="flex w-full flex-col gap-4">
          <div className="flex flex-col gap-1 rounded-lg border border-border p-3 text-left text-sm">
            <span className="text-muted-foreground">
              {t("withdraw.result.status")}
            </span>
            <span className="font-medium">{result.status}</span>
            {txid ? (
              <>
                <span className="mt-2 text-muted-foreground">
                  {t("withdraw.result.txid")}
                </span>
                <span className="break-all font-mono text-xs">{txid}</span>
              </>
            ) : null}
          </div>
          {txid ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() =>
                  void copyToClipboard(txid, {
                    copied: t("withdraw.result.copied"),
                    failed: t("withdraw.result.copyError"),
                  })
                }
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
                    href={`https://mempool.space/tx/${txid}`}
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
