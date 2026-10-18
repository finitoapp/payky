import { formatSatsAmount } from "@payky/app-shared/format-money"
import { describeDestination } from "@payky/app-shared/withdraw-destination"
import {
  amountFieldWarnings,
  buildWithdrawRequest,
  draftAmountSats,
  draftWithDestination,
  quoteErrorMessage,
  type WithdrawDraft,
  type WithdrawRequest,
  withdrawAllUnavailableKey,
} from "@payky/app-shared/withdraw-flow"
import type { AccountId } from "@payky/core/modules/account/account-types"
import {
  quoteWithdrawal,
  type WithdrawalQuote,
} from "@payky/core/modules/withdraw/withdraw-actions"
import { parseWithdrawDestination } from "@payky/core/modules/withdraw/withdraw-destination-utils"
import { ONCHAIN_WITHDRAWAL_MIN_SATS } from "@payky/core/modules/withdraw/withdraw-utils"
import { useRef, useState } from "react"
import { Switch } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { AppButton } from "../../components/app-button.tsx"
import { Field } from "../../components/field.tsx"
import { useAppRun } from "../../hooks/use-app-run.ts"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"
import {
  useBtcFiat,
  useDebouncedValue,
  useLnurlPayMetadata,
} from "./use-withdraw-data.ts"
import { Collapsible, LightningAddress } from "./withdraw-parts.tsx"

/**
 * The typed destination as Spark sees it: parsed (`null` until it is one
 * that can be paid), its hint or error, and for a Lightning address the range
 * and comment length its LNURL metadata allows.
 */
function useWithdrawDestination(raw: string) {
  const parsed = parseWithdrawDestination(raw)
  const { hint, error } = describeDestination(raw, parsed, "spark")
  const destination = parsed.ok && error === null ? parsed.value : null

  const lightningAddress = useDebouncedValue(
    destination?.kind === "lightning-address" ? destination.address : null,
    500
  )
  const metadata = useLnurlPayMetadata(lightningAddress)
  const addressSettled =
    destination?.kind === "lightning-address" &&
    lightningAddress === destination.address
  const checkingAddress =
    destination?.kind === "lightning-address" &&
    (!addressSettled || metadata.loading)
  const range = addressSettled && !metadata.loading ? metadata.data : null

  return {
    destination,
    hint,
    error,
    checkingAddress,
    range,
    addressUnavailable: addressSettled && !metadata.loading && metadata.failed,
    /** The longest LUD-12 comment the Lightning address accepts, 0 for none. */
    commentAllowed: range?.commentAllowed ?? 0,
    /** The invoice's own amount, which no amount typed can change. */
    invoiceAmountSats:
      destination?.kind === "lightning-invoice" ? destination.amountSats : null,
  }
}

export function WithdrawFormStep({
  accountId,
  availableSats,
  draft,
  onDraftChange,
  onReview,
}: {
  readonly accountId: AccountId
  readonly availableSats: number | null
  readonly draft: WithdrawDraft
  readonly onDraftChange: (draft: WithdrawDraft) => void
  readonly onReview: (request: WithdrawRequest, quote: WithdrawalQuote) => void
}) {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const locale = useLocale()
  const fiat = useBtcFiat()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  // `pending` lags a render behind: a second tap must not quote twice.
  const pendingRef = useRef(false)

  const update = (patch: Partial<WithdrawDraft>) => {
    setSubmitError(null)
    onDraftChange({ ...draft, ...patch })
  }

  const state = useWithdrawDestination(draft.destination)
  const { destination, invoiceAmountSats } = state
  const withdrawAllUnavailable = withdrawAllUnavailableKey(destination)
  const effectiveWithdrawAll =
    draft.withdrawAll && withdrawAllUnavailable === null
  const typedSats = draftAmountSats(draft, fiat)
  const onchainMinimumSats =
    destination?.kind === "onchain" ? ONCHAIN_WITHDRAWAL_MIN_SATS : null
  const { outOfRange, belowOnchainMinimum } = amountFieldWarnings({
    typedSats,
    range: state.range,
    withdrawAll: effectiveWithdrawAll,
    onchainMinimumSats,
  })
  const sats = (amount: number) => formatSatsAmount(amount, locale)
  const equivalent =
    typedSats === null
      ? null
      : draft.unit === "sats"
        ? fiat.approx(typedSats)
        : t("withdraw.sats", { amount: sats(typedSats) })

  const submit = async () => {
    if (pendingRef.current) return
    setSubmitError(null)
    const built = buildWithdrawRequest({
      destination,
      destinationError: state.error,
      draft,
      typedSats,
      withdrawAll: effectiveWithdrawAll,
    })
    if (!built.ok) {
      setSubmitError(t(built.error))
      return
    }
    pendingRef.current = true
    setPending(true)
    try {
      await using run = appRun()
      const result = await run(quoteWithdrawal({ accountId, ...built.value }))
      if (!result.ok) {
        setSubmitError(quoteErrorMessage(result.error, t))
        return
      }
      onReview(built.value, result.value)
    } catch {
      setSubmitError(t("withdraw.quoteError.generic"))
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  return (
    <YStack gap="4">
      <Text color="muted-foreground">{t("withdraw.form.description")}</Text>

      <YStack gap="1.5">
        <Field
          label={t("withdraw.destination.label")}
          value={draft.destination}
          placeholder={t("withdraw.destination.placeholder")}
          autoCapitalize="none"
          autoCorrect={false}
          error={state.error === null ? undefined : t(state.error)}
          onChangeText={(value) => {
            setSubmitError(null)
            onDraftChange(draftWithDestination(draft, value))
          }}
        />
        {destination?.kind === "lightning-address" ? (
          <LightningAddress address={destination.address} />
        ) : null}
        {state.hint === null ? null : (
          <Text fontSize={13} color="muted-foreground">
            {t(state.hint)}
          </Text>
        )}
        {state.checkingAddress ? (
          <Text fontSize={13} color="muted-foreground">
            {t("withdraw.destination.checkingAddress")}
          </Text>
        ) : null}
        {state.addressUnavailable ? (
          <Text fontSize={13} color="red-600" accessibilityRole="alert">
            {t("withdraw.error.lightningAddressUnavailable")}
          </Text>
        ) : null}
      </YStack>

      <YStack gap="1.5">
        {invoiceAmountSats === null ? (
          <XStack gap="2">
            <XStack flex={1}>
              <AppButton
                label={t("withdraw.amount.unitSats")}
                variant={draft.unit === "sats" ? "primary" : "secondary"}
                disabled={effectiveWithdrawAll}
                onPress={() => update({ unit: "sats", amount: "" })}
              />
            </XStack>
            <XStack flex={1}>
              <AppButton
                label={fiat.currency}
                variant={draft.unit === "fiat" ? "primary" : "secondary"}
                disabled={effectiveWithdrawAll || fiat.rate === null}
                onPress={() => update({ unit: "fiat", amount: "" })}
              />
            </XStack>
          </XStack>
        ) : null}
        <Field
          label={t("withdraw.amount.label")}
          value={
            invoiceAmountSats !== null
              ? String(invoiceAmountSats)
              : draft.amount
          }
          disabled={effectiveWithdrawAll || invoiceAmountSats !== null}
          keyboardType={draft.unit === "sats" ? "number-pad" : "decimal-pad"}
          placeholder={
            draft.unit === "sats"
              ? t("withdraw.amount.placeholder")
              : t("withdraw.amount.placeholderFiat", {
                  currency: fiat.currency,
                })
          }
          onChangeText={(amount) => update({ amount })}
        />
        {invoiceAmountSats !== null ? (
          <Text fontSize={13} color="muted-foreground">
            {`${t("withdraw.amount.fromInvoice")} ${fiat.approx(invoiceAmountSats) ?? ""}`.trim()}
          </Text>
        ) : equivalent !== null && !effectiveWithdrawAll ? (
          <Text fontSize={13} color="muted-foreground">
            {equivalent}
          </Text>
        ) : null}
        {state.range === null ? null : (
          <Text
            fontSize={13}
            color={outOfRange ? "red-600" : "muted-foreground"}
          >
            {t("withdraw.amount.range", {
              min: sats(state.range.minSendableSats),
              max: sats(state.range.maxSendableSats),
            })}
          </Text>
        )}
        {onchainMinimumSats === null ? null : (
          <Text
            fontSize={13}
            color={belowOnchainMinimum ? "red-600" : "muted-foreground"}
          >
            {t("withdraw.amount.onchainMinimum", {
              amount: sats(onchainMinimumSats),
            })}
          </Text>
        )}
        {availableSats === null ? null : (
          <Text fontSize={13} color="muted-foreground">
            {`${t("withdraw.amount.available", { amount: sats(availableSats) })} ${fiat.approx(availableSats) ?? ""}`.trim()}
          </Text>
        )}
      </YStack>

      <XStack gap="3" items="center">
        <Switch
          accessibilityLabel={t("withdraw.all.label")}
          value={effectiveWithdrawAll}
          disabled={withdrawAllUnavailable !== null}
          onValueChange={(withdrawAll) => update({ withdrawAll })}
        />
        <YStack flex={1}>
          <Text fontWeight="600">{t("withdraw.all.label")}</Text>
          <Text fontSize={13} color="muted-foreground">
            {t(withdrawAllUnavailable ?? "withdraw.all.description")}
          </Text>
        </YStack>
      </XStack>

      <Collapsible label={t("withdraw.options.label")}>
        {state.commentAllowed > 0 ? (
          <YStack gap="1">
            <Field
              label={t("withdraw.recipientComment.label")}
              value={draft.recipientComment}
              maxLength={state.commentAllowed}
              onChangeText={(recipientComment) => update({ recipientComment })}
            />
            <Text fontSize={13} color="muted-foreground">
              {t("withdraw.recipientComment.hint", {
                max: state.commentAllowed,
              })}
            </Text>
          </YStack>
        ) : null}
        <YStack gap="1">
          <Field
            label={t("withdraw.comment.label")}
            value={draft.comment}
            maxLength={255}
            onChangeText={(comment) => update({ comment })}
          />
          <Text fontSize={13} color="muted-foreground">
            {t("withdraw.comment.hint")}
          </Text>
        </YStack>
      </Collapsible>

      {submitError === null ? null : (
        <Text color="red-600" accessibilityRole="alert">
          {submitError}
        </Text>
      )}
      <AppButton
        label={pending ? t("withdraw.quotePending") : t("withdraw.continue")}
        pending={pending}
        onPress={() => void submit()}
      />
    </YStack>
  )
}
