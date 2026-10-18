import type { WithdrawDraft } from "@payky/app-shared/withdraw-flow"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"
import { WithdrawCollapsible } from "./withdraw-collapsible.tsx"

/**
 * "Options": the LUD-12 comment for a Lightning address that accepts one,
 * and the merchant's own note (withdraw/0010).
 */
export function WithdrawOptionsFields({
  draft,
  onChange,
  commentAllowed,
}: {
  readonly draft: WithdrawDraft
  readonly onChange: (patch: Partial<WithdrawDraft>) => void
  /** The longest comment the recipient accepts, 0 for none. */
  readonly commentAllowed: number
}) {
  const { t } = useTranslation()
  return (
    <WithdrawCollapsible
      label={t("withdraw.options.label")}
      defaultOpen={draft.recipientComment !== "" || draft.comment !== ""}
    >
      {commentAllowed > 0 ? (
        <Field>
          <FieldLabel htmlFor="withdraw-recipient-comment">
            {t("withdraw.recipientComment.label")}
          </FieldLabel>
          <Input
            id="withdraw-recipient-comment"
            value={draft.recipientComment}
            maxLength={commentAllowed}
            onChange={(event) =>
              onChange({ recipientComment: event.target.value })
            }
          />
          <FieldDescription>
            {t("withdraw.recipientComment.hint", { max: commentAllowed })}
          </FieldDescription>
        </Field>
      ) : null}
      <Field>
        <FieldLabel htmlFor="withdraw-comment">
          {t("withdraw.comment.label")}
        </FieldLabel>
        <Input
          id="withdraw-comment"
          value={draft.comment}
          maxLength={255}
          onChange={(event) => onChange({ comment: event.target.value })}
        />
        <FieldDescription>{t("withdraw.comment.hint")}</FieldDescription>
      </Field>
    </WithdrawCollapsible>
  )
}
