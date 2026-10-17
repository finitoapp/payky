import { differenceInCalendarDays } from "date-fns"

export const formatDate = (value: Date, locale: string = "en-US") =>
  value.toLocaleDateString(locale, {
    dateStyle: "medium",
  })

/**
 * A day heading: "Today"/"Yesterday" in the locale's own words for the two
 * most recent days, `formatDate` for anything older (or in the future).
 */
export const formatRelativeDate = (
  value: Date,
  now: Date,
  locale: string = "en-US"
) => {
  const days = differenceInCalendarDays(value, now)
  if (days < -1 || days > 0) return formatDate(value, locale)
  // Hermes may ship without `Intl.RelativeTimeFormat`; the plain date still
  // names the day, only without the "Today" wording.
  if (typeof Intl.RelativeTimeFormat !== "function")
    return formatDate(value, locale)

  const label = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
  }).format(days, "day")
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1)
}

export const formatDateTime = (value: Date, locale: string = "en-US") =>
  value.toLocaleString(locale, {
    timeStyle: "short",
    dateStyle: "medium",
  })

export const formatTime = (value: Date, locale: string = "en-US") =>
  value.toLocaleTimeString(locale, {
    timeStyle: "short",
  })
