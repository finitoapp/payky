import { useAtom } from "jotai"
import { CheckIcon, UserRoundIcon } from "lucide-react"

import { employeePickerOpenAtom } from "@/atoms/employee-picker.ts"
import { Button } from "@/components/ui/button.tsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import { activeEmployeesQuery } from "@/core/modules/employee/employee-queries.ts"
import type { EmployeeId } from "@/core/modules/employee/employee-types.ts"
import { setCurrentEmployee } from "@/core/modules/station/station-config-actions.ts"
import { currentEmployeeQuery } from "@/core/modules/station/station-queries.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useRunToast } from "@/hooks/use-run-toast.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * "Who's selling?": one tap picks the employee the next payments are taken
 * under, with no PIN (station/0009). Mounted once by the station shell.
 */
export function EmployeePickerDialog() {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const [open, setOpen] = useAtom(employeePickerOpenAtom)
  const employees = useEvoluQuery(activeEmployeesQuery).data
  const [currentEmployee] = useEvoluQuery(currentEmployeeQuery).data

  const pick = (employeeId: EmployeeId) => {
    setOpen(false)
    void runToast(async (run) => {
      await run.ok(setCurrentEmployee(employeeId))
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("station.employeePicker.title")}</DialogTitle>
          <DialogDescription>
            {t("station.employeePicker.description")}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          {employees.map((employee) => {
            const current = employee.id === currentEmployee?.id
            return (
              <li key={employee.id}>
                <Button
                  type="button"
                  variant={current ? "default" : "outline"}
                  size="lg"
                  className="w-full justify-start"
                  aria-pressed={current}
                  onClick={() => {
                    pick(employee.id)
                  }}
                >
                  {current ? (
                    <CheckIcon data-icon="inline-start" />
                  ) : (
                    <UserRoundIcon data-icon="inline-start" />
                  )}
                  {employee.name}
                </Button>
              </li>
            )
          })}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
