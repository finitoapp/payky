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
    web: [
      "apps/web-app/src/features/activity/activity-row.tsx",
      "apps/web-app/src/features/activity/activity-history-skeleton.tsx",
    ],
    status: "matched",
    allowedDifferences: {
      VerticalNav:
        "native draws each history's day cards here, in the ActivityList both histories share; web draws them in payment-history.tsx and bill-history.tsx",
      ListSkeleton:
        "web's pagination placeholder is ActivityHistorySkeleton, a VerticalNav-shaped skeleton; native uses the kit's ListSkeleton",
      Skeleton: "inside ListSkeleton",
    },
  },
  {
    native: "src/features/activity/activity-shell.tsx",
    web: [
      "apps/web-app/src/features/activity/activity-tabs.tsx",
      "apps/web-app/src/features/activity/activity-pages.tsx",
    ],
    status: "matched",
    allowedDifferences: {
      ListSkeleton:
        "the Suspense fallback; web's is ActivityHistorySkeleton, the same VerticalNav-shaped placeholder",
    },
  },
  {
    native: "src/features/activity/bill-detail-page.tsx",
    web: ["apps/web-app/src/features/activity/bill-detail.tsx"],
    status: "matched",
    allowedDifferences: {
      Badge:
        "drawn by BillStatusBadge and PaymentStatusBadge, which wrap web's Badge + class maps",
      CollisionAlert:
        "web wraps the same CollisionAlert in BillCancellationCollisionPanel; native composes it with BillCancellationCollisionActions in place",
    },
  },
  {
    native: "src/features/activity/bill-history-page.tsx",
    web: ["apps/web-app/src/features/activity/bill-history.tsx"],
    status: "matched",
    allowedDifferences: {
      VerticalNav: "drawn by the shared ActivityList in activity-parts.tsx",
    },
  },
  {
    native: "src/features/activity/detail-parts.tsx",
    web: [
      "apps/web-app/src/features/activity/bill-coverage-warning.tsx",
      "apps/web-app/src/components/detail-row.tsx",
    ],
    status: "matched",
    allowedDifferences: {
      Collapsible: "Technical, web's PaymentDetailTechnical",
      CollapsibleContent: "Technical, web's PaymentDetailTechnical",
      CollapsibleTrigger: "Technical, web's PaymentDetailTechnical",
      DetailRow:
        "the coverage warning's amount rows (web's BillCoverageAmountRow) and OptionalRow",
      FadeHeader:
        "DetailScreen, web's detail page header in activity-pages.tsx",
    },
  },
  {
    native: "src/features/activity/payment-detail-page.tsx",
    web: ["apps/web-app/src/features/activity/payment-detail.tsx"],
    status: "matched",
    allowedDifferences: {
      Collapsible:
        "drawn by Technical in detail-parts.tsx, which both detail screens share; web keeps PaymentDetailTechnical in payment-detail.tsx",
      CollapsibleContent:
        "drawn by Technical in detail-parts.tsx, which both detail screens share; web keeps PaymentDetailTechnical in payment-detail.tsx",
      CollapsibleTrigger:
        "drawn by Technical in detail-parts.tsx, which both detail screens share; web keeps PaymentDetailTechnical in payment-detail.tsx",
    },
  },
  {
    native: "src/features/activity/payment-history-page.tsx",
    web: ["apps/web-app/src/features/activity/payment-history.tsx"],
    status: "matched",
    allowedDifferences: {
      VerticalNav: "drawn by the shared ActivityList in activity-parts.tsx",
    },
  },
  {
    native: "src/features/activity/payment-refunds.tsx",
    web: ["apps/web-app/src/features/activity/payment-refunds.tsx"],
    status: "matched",
  },
  {
    native: "src/features/activity/bill-status-display.tsx",
    web: ["apps/web-app/src/features/activity/bill-status-display.ts"],
    status: "matched",
    allowedDifferences: {
      Badge:
        "web exports the badge's class map and draws the Badge at each call site; native wraps both in BillStatusBadge",
    },
  },
  {
    native: "src/features/activity/payment-status-display.tsx",
    web: ["apps/web-app/src/features/activity/payment-status-display.tsx"],
    status: "matched",
    allowedDifferences: {
      Badge:
        "web exports paymentStatusBadgeClassName and draws the Badge at each call site; native wraps both in PaymentStatusBadge",
    },
  },
  {
    native: "src/features/bill/assign-table-dialog.tsx",
    web: ["apps/web-app/src/features/bill/assign-table-dialog.tsx"],
    status: "matched",
  },
  {
    native: "src/features/bill/bill-page.tsx",
    web: ["apps/web-app/src/features/bill/bill-page.tsx"],
    status: "matched",
    allowedDifferences: {
      SearchInput:
        "native's cart has no catalog search yet (native.md, 4.2b gaps); the row keeps the scan toggle beside the category bar",
      RouteMessage:
        "web answers an unparsable bill id in the route file (_terminal.bill.tsx); native's route renders this page, which does it",
    },
  },
  {
    native: "src/features/bill/bill-scan-view.tsx",
    web: ["apps/web-app/src/features/bill/bill-scan-view.tsx"],
    status: "matched",
    allowedDifferences: {
      Card: "the page passes its own item brick, a Card in the bill grid, as lastScanned, so its quantity controls are the grid's",
    },
  },
  {
    native: "src/features/bill/create-catalog-item-dialog.tsx",
    web: ["apps/web-app/src/features/bill/create-catalog-item-dialog.tsx"],
    status: "matched",
  },
  {
    native: "src/features/bill/scan-code-collision-dialog.tsx",
    web: ["apps/web-app/src/features/bill/scan-code-collision-dialog.tsx"],
    status: "matched",
  },
  {
    native: "src/features/bill/split-bill-dialog.tsx",
    web: ["apps/web-app/src/features/bill/split-bill-dialog.tsx"],
    status: "matched",
    allowedDifferences: {
      DialogClose: "the native dialog has no close part; Cancel calls onClose",
    },
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
    status: "matched",
    allowedDifferences: {
      RouteMessage:
        "web answers an invalid tip link in its route file (_terminal.payment.tip.tsx); native's route renders this page, which does it",
    },
  },
  {
    native: "src/features/payment-wait/payment-wait-bolt-card.tsx",
    web: ["apps/web-app/src/features/payment-wait/payment-wait-bolt-card.tsx"],
    status: "matched",
  },
  {
    native: "src/features/payment-wait/payment-wait-card-tab.tsx",
    web: ["apps/web-app/src/features/payment-wait/payment-wait-card-tab.tsx"],
    status: "matched",
  },
  {
    native: "src/features/payment-wait/payment-wait-cashu-tab.tsx",
    web: [
      "apps/web-app/src/features/payment-wait/payment-wait-cashu-tab.tsx",
      "apps/web-app/src/features/payment-wait/payment-wait-qr-request.tsx",
    ],
    status: "matched",
  },
  {
    native: "src/features/payment-wait/payment-wait-iban-tab.tsx",
    web: [
      "apps/web-app/src/features/payment-wait/payment-wait-iban-tab.tsx",
      "apps/web-app/src/features/payment-wait/payment-wait-qr-request.tsx",
    ],
    status: "matched",
  },
  {
    native: "src/features/payment-wait/payment-wait-page.tsx",
    web: [
      "apps/web-app/src/features/payment-wait/payment-wait-page.tsx",
      "apps/web-app/src/features/payment-wait/payment-wait-cash-tab.tsx",
      "apps/web-app/src/features/payment-wait/payment-wait-qr-request.tsx",
    ],
    status: "matched",
    allowedDifferences: {
      TabsContent:
        "web renders a TabsContent per method only as a screen-reader line; native draws the active method's content directly and states it in the prompt",
    },
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
    status: "matched",
    allowedDifferences: {
      Badge:
        "web keeps device badges in this page; native extracts them to device-parts.tsx",
      Checkbox:
        "web keeps permission controls in this page; native extracts them to device-item.tsx",
      Dialog:
        "web keeps device editors in this page; native extracts them to device-item.tsx",
      DialogContent:
        "web keeps device editors in this page; native extracts them to device-item.tsx",
      DialogDescription:
        "web keeps device editors in this page; native extracts them to device-item.tsx",
      DialogFooter:
        "web keeps device editors in this page; native extracts them to device-item.tsx",
      DialogHeader:
        "web keeps device editors in this page; native extracts them to device-item.tsx",
      DialogTitle:
        "web keeps device editors in this page; native extracts them to device-item.tsx",
      Field:
        "web keeps PIN and permission fields in this page; native extracts them to new-pin-fields.tsx and device-item.tsx",
      FieldDescription:
        "web keeps PIN and permission fields in this page; native extracts them to new-pin-fields.tsx and device-item.tsx",
      FieldError:
        "web keeps PIN and permission fields in this page; native extracts them to new-pin-fields.tsx and device-item.tsx",
      FieldGroup:
        "web keeps PIN and permission fields in this page; native extracts them to new-pin-fields.tsx and device-item.tsx",
      FieldLabel:
        "web keeps PIN and permission fields in this page; native extracts them to new-pin-fields.tsx and device-item.tsx",
      Input:
        "web keeps PIN and rename fields in this page; native extracts them to new-pin-fields.tsx and device-parts.tsx",
      Select:
        "web keeps device preset controls in this page; native extracts them to device-parts.tsx",
      SelectContent:
        "web keeps device preset controls in this page; native extracts them to device-parts.tsx",
      SelectItem:
        "web keeps device preset controls in this page; native extracts them to device-parts.tsx",
      SelectTrigger:
        "web keeps device preset controls in this page; native extracts them to device-parts.tsx",
      SelectValue:
        "web keeps device preset controls in this page; native extracts them to device-parts.tsx",
    },
  },
  {
    native: "src/features/settings/access/account-transfer-source-page.tsx",
    web: [
      "apps/web-app/src/features/settings/account-transfer-source-page.tsx",
    ],
    status: "matched",
  },
  {
    native: "src/features/settings/access/change-pin-card.tsx",
    web: ["apps/web-app/src/features/settings/access/access-settings-page.tsx"],
    status: "matched",
    allowedDifferences: {
      Badge:
        "the web file contains the full access page; native keeps this PIN card in its own file",
      CardDescription:
        "the web file contains the full access page; native keeps this PIN card in its own file",
      Checkbox:
        "the web file contains the full access page; native keeps permission controls in sibling files",
      Dialog:
        "the web file contains the full access page; native keeps device editors in sibling files",
      DialogContent:
        "the web file contains the full access page; native keeps device editors in sibling files",
      DialogDescription:
        "the web file contains the full access page; native keeps device editors in sibling files",
      DialogFooter:
        "the web file contains the full access page; native keeps device editors in sibling files",
      DialogHeader:
        "the web file contains the full access page; native keeps device editors in sibling files",
      DialogTitle:
        "the web file contains the full access page; native keeps device editors in sibling files",
      FadeHeader:
        "the web page owns its route header; this native child renders only the PIN card",
      Field:
        "the web file contains the full access page; native extracts the PIN fields to new-pin-fields.tsx",
      FieldDescription:
        "the web file contains the full access page; native extracts the PIN fields to new-pin-fields.tsx",
      FieldError:
        "the web file contains the full access page; native extracts the PIN fields to new-pin-fields.tsx",
      FieldGroup:
        "the web file contains the full access page; native extracts the PIN fields to new-pin-fields.tsx",
      FieldLabel:
        "the web file contains the full access page; native extracts the PIN fields to new-pin-fields.tsx",
      Input:
        "the web file contains the full access page; native extracts the PIN fields to new-pin-fields.tsx",
      Select:
        "the web file contains the full access page; native keeps device presets in device-parts.tsx",
      SelectContent:
        "the web file contains the full access page; native keeps device presets in device-parts.tsx",
      SelectItem:
        "the web file contains the full access page; native keeps device presets in device-parts.tsx",
      SelectTrigger:
        "the web file contains the full access page; native keeps device presets in device-parts.tsx",
      SelectValue:
        "the web file contains the full access page; native keeps device presets in device-parts.tsx",
    },
  },
  {
    native: "src/features/settings/access/device-item.tsx",
    web: ["apps/web-app/src/features/settings/access/access-settings-page.tsx"],
    status: "matched",
    allowedDifferences: {
      Badge:
        "the web file contains the full access page; native renders device badges in device-parts.tsx",
      Card: "the web file contains the full access page; native places this row inside the parent card in access-settings-page.tsx",
      CardContent:
        "the web file contains the full access page; native places this row inside the parent card in access-settings-page.tsx",
      CardDescription:
        "the web file contains the full access page; native places this row inside the parent card in access-settings-page.tsx",
      CardFooter:
        "the web file contains the full access page; native places this row inside the parent card in access-settings-page.tsx",
      CardHeader:
        "the web file contains the full access page; native places this row inside the parent card in access-settings-page.tsx",
      CardTitle:
        "the web file contains the full access page; native places this row inside the parent card in access-settings-page.tsx",
      FadeHeader:
        "the web page owns its route header; this native child renders one device row",
      FieldError:
        "the web file contains the full access page; the native permission editor has no input error field",
      FieldContent:
        "native's field kit groups the permission label and description; web's field markup does not need this wrapper",
      Input:
        "the web file contains the full access page; native keeps the device rename input in device-parts.tsx",
      Select:
        "the web file contains the full access page; native keeps device presets in device-parts.tsx",
      SelectContent:
        "the web file contains the full access page; native keeps device presets in device-parts.tsx",
      SelectItem:
        "the web file contains the full access page; native keeps device presets in device-parts.tsx",
      SelectTrigger:
        "the web file contains the full access page; native keeps device presets in device-parts.tsx",
      SelectValue:
        "the web file contains the full access page; native keeps device presets in device-parts.tsx",
    },
  },
  {
    native: "src/features/settings/access/device-parts.tsx",
    web: ["apps/web-app/src/features/settings/access/access-settings-page.tsx"],
    status: "matched",
    allowedDifferences: {
      Card: "the web file contains the full access page; native places these device helpers in their parent card and row",
      CardContent:
        "the web file contains the full access page; native places these device helpers in their parent card and row",
      CardDescription:
        "the web file contains the full access page; native places these device helpers in their parent card and row",
      CardFooter:
        "the web file contains the full access page; native places these device helpers in their parent card and row",
      CardHeader:
        "the web file contains the full access page; native places these device helpers in their parent card and row",
      CardTitle:
        "the web file contains the full access page; native places these device helpers in their parent card and row",
      Checkbox:
        "the web file contains the full access page; native keeps permission checkboxes in device-item.tsx",
      Dialog:
        "the web file contains the full access page; native keeps device dialogs in device-item.tsx",
      DialogContent:
        "the web file contains the full access page; native keeps device dialogs in device-item.tsx",
      DialogDescription:
        "the web file contains the full access page; native keeps device dialogs in device-item.tsx",
      DialogFooter:
        "the web file contains the full access page; native keeps device dialogs in device-item.tsx",
      DialogHeader:
        "the web file contains the full access page; native keeps device dialogs in device-item.tsx",
      DialogTitle:
        "the web file contains the full access page; native keeps device dialogs in device-item.tsx",
      FadeHeader:
        "the web page owns its route header; this native file supplies device subcomponents",
      FieldDescription:
        "the web file contains the full access page; native keeps permission descriptions in device-item.tsx",
      FieldError:
        "the web file contains the full access page; native keeps permission errors in device-item.tsx",
      FieldGroup:
        "the web file contains the full access page; native keeps permission groups in device-item.tsx",
    },
  },
  {
    native: "src/features/settings/access/new-pin-fields.tsx",
    web: ["apps/web-app/src/features/settings/access/access-settings-page.tsx"],
    status: "matched",
    allowedDifferences: {
      Badge:
        "the web file contains the full access page; native keeps device badges in device-parts.tsx",
      Button:
        "the web file contains the full access page; native keeps PIN actions in parent cards",
      Card: "the web file contains the full access page; native keeps PIN fields inside parent cards",
      CardContent:
        "the web file contains the full access page; native keeps PIN fields inside parent cards",
      CardDescription:
        "the web file contains the full access page; native keeps PIN fields inside parent cards",
      CardFooter:
        "the web file contains the full access page; native keeps PIN fields inside parent cards",
      CardHeader:
        "the web file contains the full access page; native keeps PIN fields inside parent cards",
      CardTitle:
        "the web file contains the full access page; native keeps PIN fields inside parent cards",
      Checkbox:
        "the web file contains the full access page; native keeps permission checkboxes in device-item.tsx",
      Dialog:
        "the web file contains the full access page; native keeps device dialogs in device-item.tsx",
      DialogContent:
        "the web file contains the full access page; native keeps device dialogs in device-item.tsx",
      DialogDescription:
        "the web file contains the full access page; native keeps device dialogs in device-item.tsx",
      DialogFooter:
        "the web file contains the full access page; native keeps device dialogs in device-item.tsx",
      DialogHeader:
        "the web file contains the full access page; native keeps device dialogs in device-item.tsx",
      DialogTitle:
        "the web file contains the full access page; native keeps device dialogs in device-item.tsx",
      FadeHeader:
        "the web page owns its route header; this native child renders only PIN fields",
      Select:
        "the web file contains the full access page; native keeps device presets in device-parts.tsx",
      SelectContent:
        "the web file contains the full access page; native keeps device presets in device-parts.tsx",
      SelectItem:
        "the web file contains the full access page; native keeps device presets in device-parts.tsx",
      SelectTrigger:
        "the web file contains the full access page; native keeps device presets in device-parts.tsx",
      SelectValue:
        "the web file contains the full access page; native keeps device presets in device-parts.tsx",
    },
  },
  {
    native: "src/features/settings/access/turn-on-wizard.tsx",
    web: ["apps/web-app/src/features/settings/access/access-settings-page.tsx"],
    status: "matched",
    allowedDifferences: {
      Badge:
        "the web file contains the full access page; native renders device badges in device-parts.tsx",
      Checkbox:
        "the web file contains the full access page; native renders permission controls in device-item.tsx",
      DialogFooter:
        "the web file contains the full access page; native keeps dialog actions in device-item.tsx",
      FadeHeader:
        "the web page owns its route header; this native child renders only the enable wizard",
      Field:
        "the web file contains the full access page; native extracts PIN fields to new-pin-fields.tsx",
      FieldDescription:
        "the web file contains the full access page; native extracts PIN fields to new-pin-fields.tsx",
      FieldError:
        "the web file contains the full access page; native extracts PIN fields to new-pin-fields.tsx",
      FieldGroup:
        "the web file contains the full access page; native extracts PIN fields to new-pin-fields.tsx",
      FieldLabel:
        "the web file contains the full access page; native extracts PIN fields to new-pin-fields.tsx",
      Input:
        "the web file contains the full access page; native extracts PIN fields to new-pin-fields.tsx",
      Select:
        "the web file contains the full access page; native keeps device presets in device-parts.tsx",
      SelectContent:
        "the web file contains the full access page; native keeps device presets in device-parts.tsx",
      SelectItem:
        "the web file contains the full access page; native keeps device presets in device-parts.tsx",
      SelectTrigger:
        "the web file contains the full access page; native keeps device presets in device-parts.tsx",
      SelectValue:
        "the web file contains the full access page; native keeps device presets in device-parts.tsx",
    },
  },
  {
    native: "src/features/settings/accounts/accounts-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/accounts/accounts-settings-page.tsx",
    ],
    status: "matched",
    note: "Native account rows use the last persisted nostrPicture; web prefers the active account's current profile query and falls back to the persisted picture.",
    allowedDifferences: {
      Dialog:
        "web opens restore and account-transfer-target dialogs; native keeps restore inline and opens pairing or the source route",
      DialogContent:
        "web opens restore and account-transfer-target dialogs; native keeps restore inline and opens pairing or the source route",
      DialogDescription:
        "web opens restore and account-transfer-target dialogs; native keeps restore inline and opens pairing or the source route",
      DialogHeader:
        "web opens restore and account-transfer-target dialogs; native keeps restore inline and opens pairing or the source route",
      DialogTitle:
        "web opens restore and account-transfer-target dialogs; native keeps restore inline and opens pairing or the source route",
    },
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
    status: "matched",
  },
  {
    native: "src/features/settings/categories/edit-category-page.tsx",
    web: [
      "apps/web-app/src/features/settings/categories/category-form-page.tsx",
    ],
    status: "matched",
    allowedDifferences: {
      Field:
        "the native InlineEditField composes the same field anatomy for auto-saving edits",
      FieldError:
        "the native InlineEditField composes the same validation message for auto-saving edits",
      FieldLabel:
        "the native InlineEditField composes the same label for auto-saving edits",
      Input:
        "the native InlineEditField composes the same input for auto-saving edits",
    },
  },
  {
    native: "src/features/settings/categories/new-category-page.tsx",
    web: [
      "apps/web-app/src/features/settings/categories/category-form-page.tsx",
    ],
    status: "matched",
    allowedDifferences: {
      CardFooter:
        "the web SettingsFormCard feature helper composes CardFooter; native composes the same footer directly",
    },
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
    status: "matched",
    allowedDifferences: {
      Alert: "web-only browser runtime warning, omitted in the native app",
      AlertDescription:
        "web-only browser runtime warning, omitted in the native app",
      AlertTitle: "web-only browser runtime warning, omitted in the native app",
      Badge: "rendered by the sibling fio-token-list.tsx",
      Button:
        "rendered by the sibling fio-token-form.tsx and fio-token-list.tsx",
      FieldError: "rendered by the sibling fio-token-form.tsx",
      PasswordTextarea: "rendered by the sibling fio-token-form.tsx",
    },
  },
  {
    native: "src/features/settings/fio-plugin/fio-token-form.tsx",
    web: [
      "apps/web-app/src/features/settings/fio-plugin/fio-plugin-settings-page.tsx",
    ],
    status: "matched",
    allowedDifferences: {
      Alert: "web-only browser runtime warning, omitted in the native app",
      AlertDescription:
        "web-only browser runtime warning, omitted in the native app",
      AlertTitle: "web-only browser runtime warning, omitted in the native app",
      Badge: "rendered by the sibling fio-token-list.tsx",
      FadeHeader: "rendered by the parent fio-plugin-settings-page.tsx",
    },
  },
  {
    native: "src/features/settings/fio-plugin/fio-token-list.tsx",
    web: [
      "apps/web-app/src/features/settings/fio-plugin/fio-plugin-settings-page.tsx",
    ],
    status: "matched",
    allowedDifferences: {
      Alert: "web-only browser runtime warning, omitted in the native app",
      AlertDescription:
        "web-only browser runtime warning, omitted in the native app",
      AlertTitle: "web-only browser runtime warning, omitted in the native app",
      FadeHeader: "rendered by the parent fio-plugin-settings-page.tsx",
      Field: "rendered by the sibling fio-token-form.tsx",
      FieldDescription: "rendered by the sibling fio-token-form.tsx",
      FieldError: "rendered by the sibling fio-token-form.tsx",
      FieldGroup: "rendered by the sibling fio-token-form.tsx",
      FieldLabel: "rendered by the sibling fio-token-form.tsx",
      PasswordTextarea: "rendered by the sibling fio-token-form.tsx",
    },
  },
  {
    native: "src/features/settings/home-screen/home-screen-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/inline-edit-switch.tsx",
      "apps/web-app/src/features/settings/home-screen/home-screen-settings-page.tsx",
    ],
    status: "matched",
    allowedDifferences: {
      SavedTick:
        "native keeps its existing controlled query state and result toast; web InlineEditSwitch shows a brief saved tick",
    },
  },
  {
    native: "src/features/settings/items/edit-item-page.tsx",
    web: ["apps/web-app/src/features/settings/items/item-form-page.tsx"],
    status: "matched",
    allowedDifferences: {
      FieldError:
        "native auto-saving InlineEditField components own the validation messages; the web source also includes create-form FieldError parts",
      Input:
        "native auto-saving InlineEditField components own their inputs; the web source also includes create-form Input parts",
      ScanCodeScanner:
        "native renders the camera inline after the scan-code field instead of inside a modal",
      ScanCodeScannerDialog:
        "web wraps the scanner in a dialog; native renders it inline after the scan-code field",
    },
  },
  {
    native: "src/features/settings/items/items-settings-page.tsx",
    web: ["apps/web-app/src/features/settings/items/items-settings-page.tsx"],
    status: "matched",
  },
  {
    native: "src/features/settings/items/new-item-page.tsx",
    web: ["apps/web-app/src/features/settings/items/item-form-page.tsx"],
    status: "matched",
    allowedDifferences: {
      CardFooter:
        "the web SettingsFormCard feature helper composes CardFooter; native composes the same footer directly",
      ScanCodeScanner:
        "native renders the camera inline after the scan-code field instead of inside a modal",
      ScanCodeScannerDialog:
        "web wraps the scanner in a dialog; native renders it inline after the scan-code field",
    },
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
    status: "matched",
  },
  {
    native: "src/features/settings/legal-entity/legal-entity-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/legal-entity/legal-entity-settings-page.tsx",
    ],
    status: "matched",
    allowedDifferences: {
      Checkbox:
        "native uses the existing controlled checkbox for VAT payer status; the web source routes the same immediate save through InlineEditCheckbox",
      Field:
        "native renders the existing country and currency controls inside the shared Field layout; web's InlineEditSelect owns that layout",
      FieldContent:
        "native renders VAT text in the shared FieldContent layout; web's InlineEditCheckbox owns that layout",
      FieldLabel:
        "native renders the select labels as FieldLabel parts; web's InlineEditSelect owns those labels",
      Select:
        "native uses the platform choice sheet and shows the unset country prompt above the empty select; web uses InlineEditSelect with its placeholder inside the field",
      SelectContent:
        "native's SelectContent presents the available values in the platform choice sheet; web's InlineEditSelect owns its select presentation",
      SelectItem:
        "native renders the country and currency options as SelectItem rows; web's InlineEditSelect owns its option list",
      SelectTrigger:
        "native uses a SelectTrigger for the platform choice sheet; web's InlineEditSelect owns its select trigger",
      SelectValue:
        "native uses SelectValue to show the current choice; web's InlineEditSelect owns its value display",
    },
  },
  {
    native:
      "src/features/settings/payment-accounts/card-switchio-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/payment-accounts/card-switchio-settings-page.tsx",
    ],
    status: "matched",
  },
  {
    native:
      "src/features/settings/payment-accounts/cashu-account-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/cashu/cashu-account-settings-page.tsx",
    ],
    status: "matched",
  },
  {
    native: "src/features/settings/payment-accounts/cashu-mint-detail-page.tsx",
    web: [
      "apps/web-app/src/features/settings/cashu/cashu-mint-detail-page.tsx",
    ],
    status: "matched",
    allowedDifferences: {
      Field:
        "the web-only move-between-mints panel is not implemented in the native screen",
      FieldDescription:
        "the web-only move-between-mints panel is not implemented in the native screen",
      FieldError:
        "the web-only move-between-mints panel is not implemented in the native screen",
      FieldLabel:
        "the web-only move-between-mints panel is not implemented in the native screen",
      Input:
        "the web-only move-between-mints panel is not implemented in the native screen",
    },
  },
  {
    native: "src/features/settings/payment-accounts/cashu-mint-new-page.tsx",
    web: ["apps/web-app/src/features/settings/cashu/cashu-mint-new-page.tsx"],
    status: "matched",
  },
  {
    native: "src/features/settings/payment-accounts/cashu-mints-page.tsx",
    web: ["apps/web-app/src/features/settings/cashu/cashu-mints-page.tsx"],
    status: "matched",
  },
  {
    native:
      "src/features/settings/payment-accounts/fiat-bank-account-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/payment-accounts/fiat-bank-account-settings-page.tsx",
    ],
    status: "matched",
    allowedDifferences: {
      Select:
        "native bottom-sheet selector replaces web's feature-level InlineEditSelect",
      SelectContent:
        "native bottom-sheet selector replaces web's feature-level InlineEditSelect",
      SelectItem:
        "native bottom-sheet selector replaces web's feature-level InlineEditSelect",
      SelectTrigger:
        "native bottom-sheet selector replaces web's feature-level InlineEditSelect",
      SelectValue:
        "native bottom-sheet selector replaces web's feature-level InlineEditSelect",
      ToggleGroup:
        "native toggle group replaces web's shared BankAccountFormatToggle helper",
      ToggleGroupItem:
        "native toggle group replaces web's shared BankAccountFormatToggle helper",
    },
  },
  {
    native:
      "src/features/settings/payment-accounts/payment-accounts-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/payment-accounts/payment-accounts-settings-page.tsx",
    ],
    status: "matched",
  },
  {
    native:
      "src/features/settings/payment-accounts/spark-account-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/payment-accounts/spark-account-settings-page.tsx",
    ],
    status: "matched",
  },
  {
    native:
      "src/features/settings/payment-number-series/payment-number-series-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/payment-number-series/payment-number-series-settings-page.tsx",
    ],
    status: "matched",
    allowedDifferences: {
      DateInput:
        "native edits the existing yyyy-MM-dd value with a keyboard field; web uses the browser date input",
      OptionToggleGroup:
        "native renders the option groups directly and saves each choice immediately; web wraps the same immediate choices in InlineEditToggleGroup",
    },
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
    status: "matched",
    allowedDifferences: {
      ListSkeleton:
        "Native keeps the existing ActivityIndicator footer while fetching more rows; web adds a ListSkeleton.",
      VerticalNavRow:
        "Native uses a row helper to preserve FlatList virtualization inside the VerticalNav shell.",
      VerticalNav:
        "The native row data has no per-entity icon field; screen-specific list rows will add web icons in their phase-4 steps.",
    },
  },
  {
    native: "src/features/settings/settings-page.tsx",
    web: ["apps/web-app/src/features/settings/settings-page.tsx"],
    status: "matched",
    allowedDifferences: {
      Building2:
        "lucide-react-native 1.57.0 has no building-2 module; native uses its available building icon.",
      ProfileCard:
        "Native keeps its existing single-row profile destination; the web profile card includes an avatar and shortened npub.",
    },
  },
  {
    native: "src/features/settings/settings-row.tsx",
    web: ["apps/web-app/src/features/settings/settings-page.tsx"],
    status: "matched",
    allowedDifferences: {
      FadeHeader:
        "This shared native part renders one settings row; the mapped web screen also includes its page header.",
    },
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
    status: "matched",
    allowedDifferences: {
      FieldError:
        "native auto-saving InlineEditField components own validation messages; the web source also includes create-form FieldError parts",
    },
  },
  {
    native: "src/features/settings/tables/new-table-page.tsx",
    web: ["apps/web-app/src/features/settings/tables/table-form-page.tsx"],
    status: "matched",
    allowedDifferences: {
      CardFooter:
        "the web SettingsFormCard feature helper composes CardFooter; native composes the same footer directly",
      FieldDescription:
        "the web source's code-field description exists only after a table has been created",
    },
  },
  {
    native: "src/features/settings/tables/tables-settings-page.tsx",
    web: ["apps/web-app/src/features/settings/tables/tables-settings-page.tsx"],
    status: "matched",
  },
  {
    native: "src/features/settings/tax-rates/tax-rates-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/tax-rates/tax-rates-settings-page.tsx",
    ],
    status: "matched",
    allowedDifferences: {
      Star: "the default-rate button uses the native secondary variant but the lucide-react-native star remains unfilled; the web fills its star icon",
      CardDescription:
        "native uses CardDescription for descriptive copy that the web renders as a paragraph",
      CardTitle:
        "native uses CardTitle for the add-rate heading that the web renders as a paragraph",
    },
  },
  {
    native: "src/features/settings/theme/theme-settings-page.tsx",
    web: ["apps/web-app/src/features/settings/theme/theme-settings-page.tsx"],
    status: "matched",
  },
  {
    native: "src/features/settings/tips/tips-settings-page.tsx",
    web: [
      "apps/web-app/src/features/settings/settings-form-card.tsx",
      "apps/web-app/src/features/settings/tips/tips-settings-page.tsx",
    ],
    status: "matched",
    allowedDifferences: {
      SavedMessage:
        "native keeps its existing success toast after Save; web SettingsFormCard displays an inline saved message",
    },
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
    native: "src/features/shared/refund-badge.tsx",
    web: ["apps/web-app/src/features/shared/refund-badge.tsx"],
    status: "matched",
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
    status: "matched",
  },
  {
    native: "src/features/terminal-home/pos-overview-page.tsx",
    web: ["apps/web-app/src/features/terminal-home/pos-overview-page.tsx"],
    status: "matched",
    allowedDifferences: {
      Button:
        "web draws its new-bill links as a Link styled with buttonVariants; native has no Link element, so they are ui/button",
    },
  },
  {
    native: "src/features/terminal-home/terminal-home-page.tsx",
    web: ["apps/web-app/src/features/terminal-home/terminal-home-page.tsx"],
    status: "matched",
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
