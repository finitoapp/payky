import { format, parseISO } from "date-fns"

import {
  type DateString,
  DateStringSchema,
} from "@/core/modules/shared/schema.ts"

/**
 * Inverses, and they have to stay that way: the FIO sync job's
 * `getSyncPeriod` round-trips a stored pointer through both to walk the
 * window back. Both work on the local clock — `format` always did, and
 * parsing as UTC used to shift the date a day in negative offsets, landing
 * `from` a day early.
 */
export const dateToDateString = (date: Date): DateString =>
  DateStringSchema.decode(format(date, "yyyy-MM-dd"))

export const dateStringToDate = (date: DateString): Date => parseISO(date)
