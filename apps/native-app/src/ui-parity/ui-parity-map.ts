/**
 * Each native screen or screen part and the web file(s) that draw the same
 * thing, so a rebuilt screen can be checked against web (`ui-parity.test.ts`).
 * Native paths are relative to `apps/native-app`, web paths to the repo root.
 * A `matched` entry must render the same kit components as its web files,
 * apart from `allowedDifferences`, each with its reason.
 */

export interface UiParityEntry {
  readonly native: string
  /** Empty for a native-only part; `note` says why. */
  readonly web: ReadonlyArray<string>
  readonly note?: string
  readonly status: "pending" | "matched"
  /** Kit component name → why native differs from web there. */
  readonly allowedDifferences?: Readonly<Record<string, string>>
}

export const uiParityMap: ReadonlyArray<UiParityEntry> = [
  {
    native: "src/components/app/access-gate.tsx",
    web: ["apps/web-app/src/components/app/access-gate.tsx"],
    status: "pending",
  },
  {
    native: "src/components/app/app-background-jobs.tsx",
    web: ["apps/web-app/src/components/app/app-background-jobs.tsx"],
    status: "pending",
  },
  {
    native: "src/components/app/app-error-screen.tsx",
    web: ["apps/web-app/src/components/app/error-boundary.tsx"],
    status: "pending",
  },
  {
    native: "src/components/app/confirm-host.tsx",
    web: ["apps/web-app/src/components/app/confirm-dialog-host.tsx"],
    status: "matched",
  },
  {
    native: "src/components/app/demo-data-seed.tsx",
    web: ["apps/web-app/src/components/app/demo-data-seed.tsx"],
    status: "pending",
  },
  {
    native: "src/components/app/device-registration.tsx",
    web: ["apps/web-app/src/components/app/device-registration.tsx"],
    status: "pending",
  },
  {
    native: "src/components/app/pin-prompt-host.tsx",
    web: ["apps/web-app/src/components/app/pin-prompt-host.tsx"],
    status: "pending",
  },
  {
    native: "src/components/app/pin-screen.tsx",
    web: ["apps/web-app/src/components/app/pin-screen.tsx"],
    status: "matched",
    allowedDifferences: {
      PasswordTextarea:
        "not ported yet (step 3.5); a secureTextEntry ui/input with the keyboard aids off holds the phrase",
      Input: "stands in for PasswordTextarea until step 3.5",
    },
  },
  {
    native: "src/components/app/sentry-controller.tsx",
    web: ["apps/web-app/src/components/app/sentry-controller.tsx"],
    status: "pending",
  },
  {
    native: "src/components/app/switchio-restored-result.tsx",
    web: ["apps/web-app/src/components/app/switchio-restored-result.tsx"],
    status: "pending",
  },
  {
    native: "src/components/app/toast-host.tsx",
    web: ["apps/web-app/src/components/ui/sonner.tsx"],
    status: "pending",
  },
  {
    native: "src/components/collision-alert.tsx",
    web: ["apps/web-app/src/components/collision-alert.tsx"],
    status: "matched",
  },
  {
    native: "src/components/copy-link.tsx",
    web: [],
    note: "Native only: web copies through a Button inline.",
    status: "matched",
    allowedDifferences: {
      Button: "web inlines this ghost copy Button at each call site",
    },
  },
  {
    native: "src/components/copyable-qr-code.tsx",
    web: ["apps/web-app/src/components/copyable-qr-code.tsx"],
    status: "matched",
  },
  {
    native: "src/components/detail-row.tsx",
    web: ["apps/web-app/src/components/detail-row.tsx"],
    status: "matched",
  },
  {
    native: "src/components/fade-header.tsx",
    web: ["apps/web-app/src/components/fade-header.tsx"],
    status: "matched",
  },
  {
    native: "src/components/field.tsx",
    web: ["apps/web-app/src/components/ui/field.tsx"],
    status: "pending",
  },
  {
    native: "src/components/inline-edit-field.tsx",
    web: ["apps/web-app/src/features/settings/inline-edit-field.tsx"],
    status: "matched",
  },
  {
    native: "src/components/list-skeleton.tsx",
    web: ["apps/web-app/src/components/list-skeleton.tsx"],
    status: "matched",
    allowedDifferences: {
      VerticalNavShell:
        "web shares the shell as verticalNavShellClassName; RN has no class names, so it is a styled component",
      VerticalNavTitle:
        "web shares the title as verticalNavTitleClassName; same reason",
    },
  },
  {
    native: "src/components/not-found-card.tsx",
    web: ["apps/web-app/src/components/not-found-card.tsx"],
    status: "matched",
  },
  {
    native: "src/components/option-toggle-group.tsx",
    web: ["apps/web-app/src/components/option-toggle-group.tsx"],
    status: "matched",
  },
  {
    native: "src/components/option-select.tsx",
    web: ["apps/web-app/src/components/option-toggle-group.tsx"],
    status: "pending",
  },
  {
    native: "src/components/password-textarea.tsx",
    web: ["apps/web-app/src/components/password-textarea.tsx"],
    status: "matched",
  },
  {
    native: "src/components/qr-code.tsx",
    web: ["apps/web-app/src/components/copyable-qr-code.tsx"],
    status: "matched",
  },
  {
    native: "src/components/route-message.tsx",
    web: ["apps/web-app/src/components/route-message.tsx"],
    status: "matched",
  },
  {
    native: "src/components/scan-code-scanner.tsx",
    web: ["apps/web-app/src/components/scan-code-scanner.tsx"],
    status: "pending",
  },
  {
    native: "src/components/screen.tsx",
    web: [],
    note: "Native only: web lays a page out with the route layout and the phone column.",
    status: "pending",
  },
  {
    native: "src/components/search-input.tsx",
    web: ["apps/web-app/src/components/search-input.tsx"],
    status: "matched",
  },
  {
    native: "src/components/sliding-pill.tsx",
    web: ["apps/web-app/src/components/sliding-pill.tsx"],
    status: "matched",
  },
  {
    native: "src/components/state-views.tsx",
    web: [
      "apps/web-app/src/components/route-message.tsx",
      "apps/web-app/src/components/list-skeleton.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/components/success-panel.tsx",
    web: ["apps/web-app/src/components/success-panel.tsx"],
    status: "matched",
  },
  {
    native: "src/components/table-tile-shell.tsx",
    web: ["apps/web-app/src/features/shared/table-tile.tsx"],
    status: "matched",
  },
  {
    native: "src/components/vertical-nav.tsx",
    web: ["apps/web-app/src/components/vertical-nav.tsx"],
    status: "matched",
  },
  {
    native: "src/features/activity/activity-parts.tsx",
    web: ["apps/web-app/src/features/activity/activity-row.tsx"],
    status: "pending",
  },
  {
    native: "src/features/activity/activity-shell.tsx",
    web: [
      "apps/web-app/src/features/activity/activity-tabs.tsx",
      "apps/web-app/src/features/activity/activity-pages.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/activity/bill-detail-page.tsx",
    web: ["apps/web-app/src/features/activity/bill-detail.tsx"],
    status: "pending",
  },
  {
    native: "src/features/activity/bill-history-page.tsx",
    web: ["apps/web-app/src/features/activity/bill-history.tsx"],
    status: "pending",
  },
  {
    native: "src/features/activity/detail-parts.tsx",
    web: [
      "apps/web-app/src/features/activity/bill-coverage-warning.tsx",
      "apps/web-app/src/components/detail-row.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/activity/payment-detail-page.tsx",
    web: ["apps/web-app/src/features/activity/payment-detail.tsx"],
    status: "pending",
  },
  {
    native: "src/features/activity/payment-history-page.tsx",
    web: ["apps/web-app/src/features/activity/payment-history.tsx"],
    status: "pending",
  },
  {
    native: "src/features/activity/payment-refunds.tsx",
    web: ["apps/web-app/src/features/activity/payment-refunds.tsx"],
    status: "pending",
  },
  {
    native: "src/features/bill/assign-table-dialog.tsx",
    web: ["apps/web-app/src/features/bill/assign-table-dialog.tsx"],
    status: "pending",
  },
  {
    native: "src/features/bill/bill-page.tsx",
    web: ["apps/web-app/src/features/bill/bill-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/bill/bill-scan-view.tsx",
    web: ["apps/web-app/src/features/bill/bill-scan-view.tsx"],
    status: "pending",
  },
  {
    native: "src/features/bill/create-catalog-item-dialog.tsx",
    web: ["apps/web-app/src/features/bill/create-catalog-item-dialog.tsx"],
    status: "pending",
  },
  {
    native: "src/features/bill/scan-code-collision-dialog.tsx",
    web: ["apps/web-app/src/features/bill/scan-code-collision-dialog.tsx"],
    status: "pending",
  },
  {
    native: "src/features/bill/split-bill-dialog.tsx",
    web: ["apps/web-app/src/features/bill/split-bill-dialog.tsx"],
    status: "pending",
  },
  {
    native: "src/features/onboarding/account-choice-step.tsx",
    web: ["apps/web-app/src/features/shared/account/account-type-choice.tsx"],
    status: "pending",
  },
  {
    native: "src/features/onboarding/language-select.tsx",
    web: ["apps/web-app/src/features/onboarding/language-select.tsx"],
    status: "pending",
  },
  {
    native: "src/features/onboarding/onboarding-page.tsx",
    web: ["apps/web-app/src/features/onboarding/onboarding-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/onboarding/payments-step.tsx",
    web: [
      "apps/web-app/src/features/onboarding/onboarding-steps/payments-step.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/onboarding/restore-sync-page.tsx",
    web: ["apps/web-app/src/features/onboarding/restore-sync-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/payment-tip/payment-tip-page.tsx",
    web: ["apps/web-app/src/features/payment-tip/payment-tip-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/payment-wait/payment-wait-bolt-card.tsx",
    web: ["apps/web-app/src/features/payment-wait/payment-wait-bolt-card.tsx"],
    status: "pending",
  },
  {
    native: "src/features/payment-wait/payment-wait-card-tab.tsx",
    web: ["apps/web-app/src/features/payment-wait/payment-wait-card-tab.tsx"],
    status: "pending",
  },
  {
    native: "src/features/payment-wait/payment-wait-cashu-tab.tsx",
    web: ["apps/web-app/src/features/payment-wait/payment-wait-cashu-tab.tsx"],
    status: "pending",
  },
  {
    native: "src/features/payment-wait/payment-wait-iban-tab.tsx",
    web: ["apps/web-app/src/features/payment-wait/payment-wait-iban-tab.tsx"],
    status: "pending",
  },
  {
    native: "src/features/payment-wait/payment-wait-page.tsx",
    web: ["apps/web-app/src/features/payment-wait/payment-wait-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/about/about-page.tsx",
    web: ["apps/web-app/src/features/settings/about/about-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/about/terms-page.tsx",
    web: ["apps/web-app/src/features/settings/about/terms-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/access/access-settings-page.tsx",
    web: ["apps/web-app/src/features/settings/access/access-settings-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/access/account-transfer-source-page.tsx",
    web: [
      "apps/web-app/src/features/settings/account-transfer-source-page.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/access/change-pin-card.tsx",
    web: ["apps/web-app/src/features/settings/access/access-settings-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/access/device-item.tsx",
    web: ["apps/web-app/src/features/settings/access/access-settings-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/access/device-parts.tsx",
    web: ["apps/web-app/src/features/settings/access/access-settings-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/access/new-pin-fields.tsx",
    web: ["apps/web-app/src/features/settings/access/access-settings-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/access/turn-on-wizard.tsx",
    web: ["apps/web-app/src/features/settings/access/access-settings-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/accounts/accounts-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/accounts/accounts-settings-page.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/assistant/assistant-chat-page.tsx",
    web: [
      "apps/web-app/src/features/settings/assistant/assistant-chat-page.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/categories/categories-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/categories/categories-settings-page.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/categories/edit-category-page.tsx",
    web: [
      "apps/web-app/src/features/settings/categories/category-form-page.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/categories/new-category-page.tsx",
    web: [
      "apps/web-app/src/features/settings/categories/category-form-page.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/debug-console/debug-console-page.tsx",
    web: [
      "apps/web-app/src/features/settings/debug-console/debug-console-settings-page.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/demo-data/demo-data-page.tsx",
    web: ["apps/web-app/src/features/settings/demo-data/demo-data-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/donations/donation-history.tsx",
    web: ["apps/web-app/src/features/settings/donations/donation-history.tsx"],
    status: "pending",
  },
  {
    native:
      "src/features/settings/donations/donations-invoice-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/donations/donations-invoice-settings-page.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/donations/donations-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/donations/donations-settings-page.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/eet/eet-certificate-import.tsx",
    web: ["apps/web-app/src/features/settings/eet/eet-certificate-card.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/eet/eet-official-test-certificates.tsx",
    web: ["apps/web-app/src/features/settings/eet/eet-certificate-card.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/eet/eet-settings-page.tsx",
    web: ["apps/web-app/src/features/settings/eet/eet-settings-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/eet/eet-test-section.tsx",
    web: ["apps/web-app/src/features/settings/eet/eet-test-card.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/eet/eet-unconfirmed-sales.tsx",
    web: [
      "apps/web-app/src/features/settings/eet/eet-unconfirmed-sales-card.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/evolu-export/evolu-export-page.tsx",
    web: [
      "apps/web-app/src/features/settings/evolu-export/evolu-export-page.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/fio-plugin/fio-plugin-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/fio-plugin/fio-plugin-settings-page.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/fio-plugin/fio-token-form.tsx",
    web: [
      "apps/web-app/src/features/settings/fio-plugin/fio-plugin-settings-page.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/fio-plugin/fio-token-list.tsx",
    web: [
      "apps/web-app/src/features/settings/fio-plugin/fio-plugin-settings-page.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/home-screen/home-screen-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/home-screen/home-screen-settings-page.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/items/edit-item-page.tsx",
    web: ["apps/web-app/src/features/settings/items/item-form-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/items/items-settings-page.tsx",
    web: ["apps/web-app/src/features/settings/items/items-settings-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/items/new-item-page.tsx",
    web: ["apps/web-app/src/features/settings/items/item-form-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/items/scan-code-button.tsx",
    web: ["apps/web-app/src/features/settings/items/item-form-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/language/language-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/language/language-settings-page.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/legal-entity/legal-entity-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/legal-entity/legal-entity-settings-page.tsx",
    ],
    status: "pending",
  },
  {
    native:
      "src/features/settings/payment-accounts/card-switchio-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/payment-accounts/card-switchio-settings-page.tsx",
    ],
    status: "pending",
  },
  {
    native:
      "src/features/settings/payment-accounts/cashu-account-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/cashu/cashu-account-settings-page.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/payment-accounts/cashu-mint-detail-page.tsx",
    web: [
      "apps/web-app/src/features/settings/cashu/cashu-mint-detail-page.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/payment-accounts/cashu-mint-new-page.tsx",
    web: ["apps/web-app/src/features/settings/cashu/cashu-mint-new-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/payment-accounts/cashu-mints-page.tsx",
    web: ["apps/web-app/src/features/settings/cashu/cashu-mints-page.tsx"],
    status: "pending",
  },
  {
    native:
      "src/features/settings/payment-accounts/fiat-bank-account-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/payment-accounts/fiat-bank-account-settings-page.tsx",
    ],
    status: "pending",
  },
  {
    native:
      "src/features/settings/payment-accounts/payment-accounts-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/payment-accounts/payment-accounts-settings-page.tsx",
    ],
    status: "pending",
  },
  {
    native:
      "src/features/settings/payment-accounts/spark-account-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/payment-accounts/spark-account-settings-page.tsx",
    ],
    status: "pending",
  },
  {
    native:
      "src/features/settings/payment-number-series/payment-number-series-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/payment-number-series/payment-number-series-settings-page.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/privacy/ai-assistant-card.tsx",
    web: ["apps/web-app/src/features/settings/privacy/ai-assistant-card.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/privacy/consent-card.tsx",
    web: [
      "apps/web-app/src/features/settings/privacy/error-reporting-card.tsx",
      "apps/web-app/src/features/settings/privacy/ai-assistant-card.tsx",
      "apps/web-app/src/features/settings/privacy/product-lookup-card.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/privacy/privacy-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/privacy/privacy-settings-page.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/profile/profile-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/profile/profile-settings-page.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/security/recovery-phrase-card.tsx",
    web: ["apps/web-app/src/features/shared/recovery-phrase-card.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/security/security-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/security/security-settings-page.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/security/transport-add-form.tsx",
    web: [
      "apps/web-app/src/features/shared/evolu-transports/transport-add-form.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/security/transport-list.tsx",
    web: [
      "apps/web-app/src/features/shared/evolu-transports/transport-toggle-list.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/security/transport-sync-status.tsx",
    web: [
      "apps/web-app/src/features/shared/evolu-transports/transport-sync-status.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/settings-form-empty-state.tsx",
    web: ["apps/web-app/src/features/settings/settings-form-empty-state.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/settings-list-parts.tsx",
    web: [
      "apps/web-app/src/features/settings/settings-list-page.tsx",
      "apps/web-app/src/features/settings/settings-entity-list.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/settings-page.tsx",
    web: ["apps/web-app/src/features/settings/settings-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/settings-row.tsx",
    web: ["apps/web-app/src/components/vertical-nav.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/support/dm-inbox-warning.tsx",
    web: ["apps/web-app/src/features/settings/support/support-chat-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/support/support-chat-page.tsx",
    web: ["apps/web-app/src/features/settings/support/support-chat-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/tables/edit-table-page.tsx",
    web: ["apps/web-app/src/features/settings/tables/table-form-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/tables/new-table-page.tsx",
    web: ["apps/web-app/src/features/settings/tables/table-form-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/tables/tables-settings-page.tsx",
    web: ["apps/web-app/src/features/settings/tables/tables-settings-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/tax-rates/tax-rates-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/tax-rates/tax-rates-settings-page.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/settings/theme/theme-settings-page.tsx",
    web: ["apps/web-app/src/features/settings/theme/theme-settings-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/settings/tips/tips-settings-page.tsx",
    web: ["apps/web-app/src/features/settings/tips/tips-settings-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/shared/account-transfer-target.tsx",
    web: [
      "apps/web-app/src/features/shared/account/account-transfer-target.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/shared/bill-cancellation-collision-actions.tsx",
    web: [
      "apps/web-app/src/features/activity/bill-cancellation-collision-panel.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/shared/category-filter-bar.tsx",
    web: ["apps/web-app/src/features/shared/category-filter-bar.tsx"],
    status: "pending",
  },
  {
    native: "src/features/shared/chat-composer.tsx",
    web: ["apps/web-app/src/features/settings/chat/chat-layout.tsx"],
    status: "pending",
  },
  {
    native: "src/features/shared/eet-sale-status.tsx",
    web: ["apps/web-app/src/features/shared/eet-sale-status.tsx"],
    status: "pending",
  },
  {
    native: "src/features/shared/restore-account-step.tsx",
    web: ["apps/web-app/src/features/shared/account/restore-account-form.tsx"],
    status: "pending",
  },
  {
    native: "src/features/shared/tax-recap.tsx",
    web: ["apps/web-app/src/features/shared/tax-recap.tsx"],
    status: "pending",
  },
  {
    native: "src/features/stats/device-breakdown.tsx",
    web: ["apps/web-app/src/features/stats/device-breakdown.tsx"],
    status: "pending",
  },
  {
    native: "src/features/stats/kpi-tiles.tsx",
    web: ["apps/web-app/src/features/stats/kpi-tiles.tsx"],
    status: "pending",
  },
  {
    native: "src/features/stats/method-breakdown.tsx",
    web: ["apps/web-app/src/features/stats/method-breakdown.tsx"],
    status: "pending",
  },
  {
    native: "src/features/stats/open-bills-summary.tsx",
    web: ["apps/web-app/src/features/stats/open-bills-summary.tsx"],
    status: "pending",
  },
  {
    native: "src/features/stats/period-selector.tsx",
    web: ["apps/web-app/src/features/stats/period-selector.tsx"],
    status: "pending",
  },
  {
    native: "src/features/stats/revenue-chart.tsx",
    web: ["apps/web-app/src/features/stats/revenue-chart.tsx"],
    status: "pending",
  },
  {
    native: "src/features/stats/sales-heatmap.tsx",
    web: ["apps/web-app/src/features/stats/sales-heatmap.tsx"],
    status: "pending",
  },
  {
    native: "src/features/stats/signals.tsx",
    web: ["apps/web-app/src/features/stats/signals.tsx"],
    status: "pending",
  },
  {
    native: "src/features/stats/stats-page.tsx",
    web: ["apps/web-app/src/features/stats/stats-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/stats/stats-section.tsx",
    web: ["apps/web-app/src/features/stats/stats-section.tsx"],
    status: "pending",
  },
  {
    native: "src/features/stats/top-sales.tsx",
    web: ["apps/web-app/src/features/stats/top-sales.tsx"],
    status: "pending",
  },
  {
    native: "src/features/stats/vat-recap.tsx",
    web: ["apps/web-app/src/features/stats/vat-recap.tsx"],
    status: "pending",
  },
  {
    native: "src/features/terminal-home/amount-keypad.tsx",
    web: [
      "apps/web-app/src/features/terminal-home/terminal-payment-keypad.tsx",
    ],
    status: "pending",
  },
  {
    native: "src/features/terminal-home/pos-overview-page.tsx",
    web: ["apps/web-app/src/features/terminal-home/pos-overview-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/terminal-home/terminal-home-page.tsx",
    web: ["apps/web-app/src/features/terminal-home/terminal-home-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/withdraw/cashu-withdraw-form-step.tsx",
    web: ["apps/web-app/src/features/withdraw/cashu-withdraw-form-step.tsx"],
    status: "pending",
  },
  {
    native: "src/features/withdraw/cashu-withdraw-page.tsx",
    web: ["apps/web-app/src/features/withdraw/cashu-withdraw-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/withdraw/cashu-withdraw-review-step.tsx",
    web: ["apps/web-app/src/features/withdraw/cashu-withdraw-review-step.tsx"],
    status: "pending",
  },
  {
    native: "src/features/withdraw/withdraw-detail-page.tsx",
    web: ["apps/web-app/src/features/withdraw/withdraw-detail-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/withdraw/withdraw-form-step.tsx",
    web: ["apps/web-app/src/features/withdraw/withdraw-form-step.tsx"],
    status: "pending",
  },
  {
    native: "src/features/withdraw/withdraw-history-page.tsx",
    web: ["apps/web-app/src/features/withdraw/withdraw-history-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/withdraw/withdraw-page.tsx",
    web: ["apps/web-app/src/features/withdraw/withdraw-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/withdraw/withdraw-parts.tsx",
    web: ["apps/web-app/src/features/withdraw/withdraw-detail-page.tsx"],
    status: "pending",
  },
  {
    native: "src/features/withdraw/withdraw-review-step.tsx",
    web: ["apps/web-app/src/features/withdraw/withdraw-review-step.tsx"],
    status: "pending",
  },
]
