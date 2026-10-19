import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { timestampMsDateCodec } from "@payky/app-shared/inline-edit-codecs"
import {
  selectCustomSparkWallet,
  selectDefaultSparkWallet,
  updateSparkAccountSyncPointer,
} from "@payky/core/modules/account/account-actions"
import { sparkAccountQuery } from "@payky/core/modules/account/account-queries"
import { sparkAccountSyncPointerByAccountIdQuery } from "@payky/core/modules/account/account-spark-queries"
import type { AccountId } from "@payky/core/modules/account/account-types"
import { normalizeMnemonic } from "@payky/core/modules/account/account-utils"
import {
  deriveDefaultSparkWalletSecret,
  type MasterKey,
  SparkMnemonicSchema,
  type SparkSecret,
  sparkMnemonicToSecret,
  sparkSecretToMnemonic,
} from "@payky/core/modules/shared/key-derivation"
import { TimestampMs } from "@payky/core/modules/shared/schema"
import { createDefaultSparkPaymentWallet } from "@payky/core/spark/spark-wallet"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { useState } from "react"
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Switch,
} from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { accountAtom } from "../../../atoms/account.ts"
import { AppButton } from "../../../components/app-button.tsx"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { Field } from "../../../components/field.tsx"
import { InlineEditField } from "../../../components/inline-edit-field.tsx"
import { OptionSelect } from "../../../components/option-select.tsx"
import { Screen } from "../../../components/screen.tsx"
import { useAccess } from "../../../core/use-access.ts"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useInlineChoice } from "../../../hooks/use-inline-choice.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useToast } from "../../../hooks/use-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { SettingsRow } from "../settings-row.tsx"

const privacyModeQueryKey = (
  activeAccountId: string,
  sparkAccountId: AccountId
) => ["spark-account-privacy-mode", activeAccountId, sparkAccountId] as const

export function SparkAccountSettingsPage() {
  const { accountId } = useAccess()
  return <SparkAccountSettings key={accountId} activeAccountId={accountId} />
}

function SparkAccountSettings({
  activeAccountId,
}: {
  readonly activeAccountId: string
}) {
  const { masterKey } = useAtomValue(accountAtom)
  const { data } = useEvoluQuery(sparkAccountQuery)
  const [account] = data

  return (
    <SparkAccountSettingsContent
      key={account?.id ?? "no-spark-account"}
      accountId={account?.id}
      secret={account?.secret ?? null}
      masterKey={masterKey}
      activeAccountId={activeAccountId}
    />
  )
}

function SparkAccountSettingsContent({
  accountId,
  secret,
  masterKey,
  activeAccountId,
}: {
  readonly accountId: AccountId | undefined
  readonly secret: SparkSecret | null
  readonly masterKey: MasterKey
  readonly activeAccountId: string
}) {
  const { t } = useTranslation()
  const isDefaultWallet =
    secret === null || secret === deriveDefaultSparkWalletSecret(masterKey)

  return (
    <Screen>
      <FadeHeader title={t("settings.paymentAccounts.method.spark")} />
      <YStack gap="3">
        <Text fontWeight="700">{t("settings.sparkAccount.form.title")}</Text>
        <Text color="muted-foreground">
          {t(
            isDefaultWallet
              ? "settings.sparkAccount.form.description"
              : "settings.sparkAccount.form.customDescription"
          )}
        </Text>

        {secret === null || accountId === undefined ? null : (
          <SparkWalletSummary
            key={accountId}
            secret={secret}
            isDefaultWallet={isDefaultWallet}
          />
        )}

        {secret === null || accountId === undefined ? null : (
          <SparkPrivacyMode
            key={`${accountId}:privacy`}
            activeAccountId={activeAccountId}
            sparkAccountId={accountId}
            secret={secret}
          />
        )}

        <Text fontWeight="700">{t("settings.sparkAccount.advanced")}</Text>
        {accountId === undefined ? null : (
          <SparkSyncPointerField key={accountId} accountId={accountId} />
        )}

        {secret === null ? null : (
          <SettingsRow
            title={t("settings.withdrawals.title")}
            value={t("settings.withdrawals.description")}
            href="/withdraw"
          />
        )}
      </YStack>
    </Screen>
  )
}

function SparkWalletSummary({
  secret,
  isDefaultWallet,
}: {
  readonly secret: SparkSecret
  readonly isDefaultWallet: boolean
}) {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const currentTitle = t(
    isDefaultWallet
      ? "settings.sparkAccount.wallet.payky.title"
      : "settings.sparkAccount.wallet.custom.title"
  )
  const currentDescription = t(
    isDefaultWallet
      ? "settings.sparkAccount.wallet.payky.description"
      : "settings.sparkAccount.wallet.custom.description"
  )

  return (
    <YStack gap="3">
      <YStack
        gap="2"
        p="3"
        rounded="lg"
        borderWidth={1}
        borderColor="border-color"
      >
        <Text fontWeight="700">{t("settings.sparkAccount.wallet.label")}</Text>
        <Text>{currentTitle}</Text>
        <Text fontSize={13} color="muted-foreground">
          {currentDescription}
        </Text>
        <AppButton
          label={t("settings.sparkAccount.wallet.change")}
          variant="secondary"
          onPress={() => setDialogOpen(true)}
        />
      </YStack>

      <Field
        label={t("settings.sparkAccount.mnemonic.label")}
        value={sparkSecretToMnemonic(secret)}
        secureTextEntry={!revealed}
        disabled
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        importantForAutofill="no"
        contextMenuHidden
        multiline={revealed}
        minH={revealed ? 96 : 48}
      />
      <Text fontSize={13} color="muted-foreground">
        {t("settings.sparkAccount.mnemonic.description")}
      </Text>
      <AppButton
        label={t(revealed ? "passwordTextarea.hide" : "passwordTextarea.show")}
        variant="secondary"
        onPress={() => setRevealed((current) => !current)}
      />

      <ChangeSparkWalletModal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        currentSecret={secret}
        isDefaultWallet={isDefaultWallet}
      />
    </YStack>
  )
}

type SparkWalletKind = "payky" | "custom"

function ChangeSparkWalletModal({
  open,
  onClose,
  currentSecret,
  isDefaultWallet,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly currentSecret: SparkSecret
  readonly isDefaultWallet: boolean
}) {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const [target, setTarget] = useState<SparkWalletKind>("custom")
  const [mnemonic, setMnemonic] = useState("")
  const [revealed, setRevealed] = useState(false)
  const normalized = normalizeMnemonic(mnemonic)
  const wordCount = normalized === "" ? 0 : normalized.split(" ").length
  const parsed = SparkMnemonicSchema.safeParse(normalized)
  const isCurrentMnemonic =
    parsed.success && sparkMnemonicToSecret(parsed.data) === currentSecret
  const mnemonicErrorKey: TranslationKey | null = isCurrentMnemonic
    ? "settings.sparkAccount.wallet.changeDialog.current"
    : !parsed.success && wordCount >= 12
      ? "settings.sparkAccount.wallet.changeDialog.invalid"
      : null
  const canSwitch =
    target === "payky" ? !isDefaultWallet : parsed.success && !isCurrentMnemonic

  const close = () => {
    setTarget("custom")
    setMnemonic("")
    setRevealed(false)
    onClose()
  }

  const switchWallet = async () => {
    if (!canSwitch) return
    const selectedTarget = target
    const selectedMnemonic = parsed.success ? parsed.data : null
    close()

    await runToast(async (run) => {
      if (selectedTarget === "payky") {
        await run.ok(selectDefaultSparkWallet())
      } else if (selectedMnemonic !== null) {
        await run.ok(selectCustomSparkWallet({ mnemonic: selectedMnemonic }))
      }
    })
  }

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <YStack flex={1} justify="center" p="4" bg="rgba(0,0,0,0.5)">
          <ScrollView keyboardShouldPersistTaps="handled">
            <YStack
              bg="card"
              rounded="6"
              p="4"
              gap="3"
              accessibilityViewIsModal
            >
              <Text fontSize="lg" fontWeight="700" accessibilityRole="header">
                {t("settings.sparkAccount.wallet.changeDialog.title")}
              </Text>
              <Text color="muted-foreground">
                {t("settings.sparkAccount.wallet.changeDialog.description")}
              </Text>

              <OptionSelect<SparkWalletKind>
                value={target}
                options={[
                  {
                    value: "payky",
                    title: t("settings.sparkAccount.wallet.payky.title"),
                    description: t(
                      isDefaultWallet
                        ? "settings.sparkAccount.wallet.changeDialog.inUse"
                        : "settings.sparkAccount.wallet.payky.description"
                    ),
                  },
                  {
                    value: "custom",
                    title: t("settings.sparkAccount.wallet.custom.title"),
                    description: t(
                      "settings.sparkAccount.wallet.custom.description"
                    ),
                  },
                ]}
                onChange={setTarget}
              />

              {target === "custom" ? (
                <>
                  <Field
                    label={t("settings.sparkAccount.mnemonic.label")}
                    value={mnemonic}
                    secureTextEntry={!revealed}
                    multiline={revealed}
                    minH={revealed ? 96 : 48}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    spellCheck={false}
                    importantForAutofill="no"
                    keyboardType="visible-password"
                    contextMenuHidden
                    error={
                      mnemonicErrorKey === null
                        ? undefined
                        : t(mnemonicErrorKey)
                    }
                    onChangeText={setMnemonic}
                  />
                  <Text fontSize={13} color="muted-foreground">
                    {t("settings.sparkAccount.wallet.changeDialog.wordCount", {
                      value: wordCount,
                    })}
                  </Text>
                  <AppButton
                    label={t(
                      revealed
                        ? "passwordTextarea.hide"
                        : "passwordTextarea.show"
                    )}
                    variant="secondary"
                    onPress={() => setRevealed((current) => !current)}
                  />
                </>
              ) : null}

              <YStack gap="2">
                <Text color="muted-foreground">
                  {t("settings.sparkAccount.wallet.warning.invoices")}
                </Text>
                <Text color="muted-foreground">
                  {t("settings.sparkAccount.wallet.warning.funds")}
                </Text>
              </YStack>

              <XStack gap="2">
                <YStack flex={1}>
                  <AppButton
                    label={t("settings.sparkAccount.wallet.cancel")}
                    variant="secondary"
                    onPress={close}
                  />
                </YStack>
                <YStack flex={1}>
                  <AppButton
                    label={t("settings.sparkAccount.wallet.switch")}
                    disabled={!canSwitch}
                    onPress={() => {
                      void switchWallet()
                    }}
                  />
                </YStack>
              </XStack>
            </YStack>
          </ScrollView>
        </YStack>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function SparkPrivacyMode({
  activeAccountId,
  sparkAccountId,
  secret,
}: {
  readonly activeAccountId: string
  readonly sparkAccountId: AccountId
  readonly secret: SparkSecret
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const queryKey = privacyModeQueryKey(activeAccountId, sparkAccountId)
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      await using wallet = await createDefaultSparkPaymentWallet(secret)
      return (await wallet.getWalletSettings())?.privateEnabled ?? false
    },
  })
  const mutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      await using wallet = await createDefaultSparkPaymentWallet(secret)
      const settings = await wallet.setPrivacyEnabled(enabled)
      if (!settings) throw new Error("Failed to save Spark privacy mode.")
      return settings.privateEnabled
    },
    onSuccess: async (privateEnabled) => {
      await queryClient.cancelQueries({ queryKey, exact: true })
      queryClient.setQueryData(queryKey, privateEnabled)
    },
    onError: () => toast.error(t("app.saveFailed")),
  })
  const privacyMode = query.data ?? false
  const choice = useInlineChoice(privacyMode, async (enabled) => {
    try {
      await mutation.mutateAsync(enabled)
      return true
    } catch {
      return false
    }
  })
  const description = query.isError
    ? t("settings.sparkAccount.privacyMode.loadError")
    : query.isPending
      ? t("settings.sparkAccount.privacyMode.loading")
      : t("settings.sparkAccount.privacyMode.description")

  return (
    <YStack gap="2">
      <XStack gap="3" items="center">
        <Switch
          accessibilityLabel={t("settings.sparkAccount.privacyMode.label")}
          value={choice.value}
          disabled={query.isPending || query.isError || mutation.isPending}
          onValueChange={(next) => {
            void choice.choose(next)
          }}
        />
        <YStack flex={1}>
          <Text fontWeight="600">
            {t("settings.sparkAccount.privacyMode.label")}
          </Text>
          <Text fontSize={13} color="muted-foreground">
            {description}
          </Text>
        </YStack>
      </XStack>
    </YStack>
  )
}

function SparkSyncPointerField({
  accountId,
}: {
  readonly accountId: AccountId
}) {
  const runToast = useRunToast()
  const { t } = useTranslation()
  const { data: pointers } = useEvoluQuery(
    sparkAccountSyncPointerByAccountIdQuery(accountId)
  )
  const [pointer] = pointers

  return (
    <InlineEditField
      label={t("settings.sparkAccount.syncPointer.label")}
      description={t("settings.sparkAccount.syncPointer.description")}
      placeholder="yyyy-MM-dd"
      keyboardType="numbers-and-punctuation"
      defaultValue={pointer?.lastSyncedAt ?? TimestampMs(Date.now())}
      codec={timestampMsDateCodec}
      errorKey="settings.sparkAccount.syncPointer.invalid"
      onSave={(nextLastSyncedAt) =>
        runToast(async (run) => {
          await run.ok(
            updateSparkAccountSyncPointer({
              id: accountId,
              lastSyncedAt: nextLastSyncedAt,
            })
          )
        })
      }
    />
  )
}
