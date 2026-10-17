import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import type { Permission } from "@payky/core/modules/access/access-types"

export const permissionLabelKeys = {
  sell: "access.permission.sell",
  activity: "access.permission.activity",
  discard: "access.permission.discard",
  refund: "access.permission.refund",
  confirm: "access.permission.confirm",
  stats: "access.permission.stats",
  settings: "access.permission.settings",
  admin: "access.permission.admin",
} satisfies Record<Permission, TranslationKey>
