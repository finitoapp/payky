import type { LinkProps } from "@tanstack/react-router"

import type { DefaultPaymentMethod } from "@/core/modules/app-settings/app-settings-types.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export type ReadinessItemId =
  | "recoveryPhrase"
  | "sync"
  | "paymentMethods"
  | "defaultPaymentMethod"
  | "bankAccount"
  | "fioPlugin"

export interface ReadinessStateInput {
  readonly hasRecoveryPhrase: boolean
  readonly hasActiveSyncTransport: boolean
  readonly hasActiveSparkAccount: boolean
  readonly hasActiveCashRegisterAccount: boolean
  readonly hasActiveFiatBankAccount: boolean
  readonly hasDefaultPaymentMethod: boolean
  readonly isDefaultPaymentMethodAvailable: boolean
  readonly hasActiveFioPlugin: boolean
}

export interface ReadinessItem {
  readonly id: ReadinessItemId
  readonly title: TranslationKey
  readonly description: TranslationKey
  readonly completed: boolean
  readonly actionLabel: TranslationKey
  readonly actionTo: LinkProps["to"]
}

export function isPaymentMethodAvailable({
  method,
  hasActiveSparkAccount,
  hasActiveCashRegisterAccount,
  hasActiveFiatBankAccount,
}: {
  readonly method: DefaultPaymentMethod | null | undefined
  readonly hasActiveSparkAccount: boolean
  readonly hasActiveCashRegisterAccount: boolean
  readonly hasActiveFiatBankAccount: boolean
}) {
  switch (method) {
    case "spark":
      return hasActiveSparkAccount
    case "cashRegister":
      return hasActiveCashRegisterAccount
    case "iban":
      return hasActiveFiatBankAccount
    default:
      return false
  }
}

export function createReadinessItems({
  hasRecoveryPhrase,
  hasActiveSyncTransport,
  hasActiveSparkAccount,
  hasActiveCashRegisterAccount,
  hasActiveFiatBankAccount,
  hasDefaultPaymentMethod,
  isDefaultPaymentMethodAvailable,
  hasActiveFioPlugin,
}: ReadinessStateInput): ReadonlyArray<ReadinessItem> {
  const hasAnyPaymentMethod =
    hasActiveSparkAccount ||
    hasActiveCashRegisterAccount ||
    hasActiveFiatBankAccount

  return [
    {
      id: "recoveryPhrase",
      title: "settings.readiness.item.recoveryPhrase.title",
      description: "settings.readiness.item.recoveryPhrase.description",
      completed: hasRecoveryPhrase,
      actionLabel: "settings.readiness.item.recoveryPhrase.action",
      actionTo: "/settings/security",
    },
    {
      id: "sync",
      title: "settings.readiness.item.sync.title",
      description: "settings.readiness.item.sync.description",
      completed: hasActiveSyncTransport,
      actionLabel: "settings.readiness.item.sync.action",
      actionTo: "/settings/security",
    },
    {
      id: "paymentMethods",
      title: "settings.readiness.item.paymentMethods.title",
      description: "settings.readiness.item.paymentMethods.description",
      completed: hasAnyPaymentMethod,
      actionLabel: "settings.readiness.item.paymentMethods.action",
      actionTo: "/settings/payment-accounts",
    },
    {
      id: "defaultPaymentMethod",
      title: "settings.readiness.item.defaultPaymentMethod.title",
      description: "settings.readiness.item.defaultPaymentMethod.description",
      completed: hasDefaultPaymentMethod && isDefaultPaymentMethodAvailable,
      actionLabel: "settings.readiness.item.defaultPaymentMethod.action",
      actionTo: "/settings/default-payment-method",
    },
    {
      id: "bankAccount",
      title: "settings.readiness.item.bankAccount.title",
      description: "settings.readiness.item.bankAccount.description",
      completed: hasActiveFiatBankAccount,
      actionLabel: "settings.readiness.item.bankAccount.action",
      actionTo: "/settings/payment-accounts",
    },
    {
      id: "fioPlugin",
      title: "settings.readiness.item.fioPlugin.title",
      description: "settings.readiness.item.fioPlugin.description",
      completed: !hasActiveFiatBankAccount || hasActiveFioPlugin,
      actionLabel: "settings.readiness.item.fioPlugin.action",
      actionTo: "/settings/fio-plugin",
    },
  ]
}
