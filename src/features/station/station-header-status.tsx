import { useSetAtom } from "jotai"
import { CloudOffIcon, UserRoundIcon } from "lucide-react"

import { employeePickerOpenAtom } from "@/atoms/employee-picker.ts"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import { activeEmployeesQuery } from "@/core/modules/employee/employee-queries.ts"
import {
  currentEmployeeQuery,
  stationOutboxStatusQuery,
} from "@/core/modules/station/station-queries.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * The start of a station's home header: who is selling, a tap away from
 * switching, and how many payments the owner has not received yet.
 */
export function StationHeaderStatus() {
  const { t } = useTranslation()
  const openEmployeePicker = useSetAtom(employeePickerOpenAtom)
  const employees = useEvoluQuery(activeEmployeesQuery).data
  const [currentEmployee] = useEvoluQuery(currentEmployeeQuery).data
  const [outbox] = useEvoluQuery(stationOutboxStatusQuery).data
  const undelivered = outbox?.undeliveredPaymentCount ?? 0

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      {employees.length > 0 ? (
        <Button
          type="button"
          variant={currentEmployee === undefined ? "default" : "outline"}
          className="max-w-full rounded-full"
          onClick={() => {
            openEmployeePicker(true)
          }}
        >
          <UserRoundIcon data-icon="inline-start" />
          <span className="truncate">
            {currentEmployee?.name ?? t("station.header.chooseEmployee")}
          </span>
        </Button>
      ) : null}
      {undelivered > 0 ? (
        <Badge variant="secondary">
          <CloudOffIcon />
          {t("station.header.undelivered", { count: undelivered })}
        </Badge>
      ) : null}
    </div>
  )
}
