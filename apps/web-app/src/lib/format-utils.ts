// Money formatting is shared with the native app; re-exported so the many web
// call sites keep one import for every `format*` helper.

export {
  formatDate,
  formatDateTime,
  formatRelativeDate,
  formatTime,
} from "@payky/app-shared/format-date"
export { formatElapsed } from "@payky/app-shared/format-elapsed"
export {
  formatAmount,
  formatMoney,
  formatSatsAmount,
} from "@payky/app-shared/format-money"
export {
  formatAddressGroups,
  formatCountdown,
} from "@payky/app-shared/format-text"
