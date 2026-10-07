import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import { activeEmployeesQuery } from "@/core/modules/employee/employee-queries.ts"
import type { EmployeeId } from "@/core/modules/employee/employee-types.ts"
import { stationsQuery } from "@/core/modules/station/station-queries.ts"
import type { StationId } from "@/core/modules/station/station-types.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export interface ActivityFilter {
  readonly stationId?: StationId
  readonly employeeId?: EmployeeId
}

const all = "all"

/**
 * Narrows the payment history to one PoS station and/or employee. Shown only
 * to an owner with stations: everyone else's payments carry neither tag.
 */
export function ActivityFilters({
  filter,
  onFilterChange,
}: {
  readonly filter: ActivityFilter
  readonly onFilterChange: (filter: ActivityFilter) => void
}) {
  const { t } = useTranslation()
  const { data: stations } = useEvoluQuery(stationsQuery)
  const { data: employees } = useEvoluQuery(activeEmployeesQuery)

  if (stations.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <FilterChips
        allLabel={t("paymentHistory.filter.allStations")}
        options={stations}
        value={filter.stationId}
        onValueChange={(stationId) => {
          onFilterChange({ ...filter, stationId })
        }}
      />
      {employees.length === 0 ? null : (
        <FilterChips
          allLabel={t("paymentHistory.filter.allEmployees")}
          options={employees}
          value={filter.employeeId}
          onValueChange={(employeeId) => {
            onFilterChange({ ...filter, employeeId })
          }}
        />
      )}
    </div>
  )
}

function FilterChips<Id extends string>({
  allLabel,
  options,
  value,
  onValueChange,
}: {
  readonly allLabel: string
  readonly options: ReadonlyArray<{ readonly id: Id; readonly name: string }>
  readonly value: Id | undefined
  readonly onValueChange: (value: Id | undefined) => void
}) {
  return (
    <div className="overflow-x-auto">
      <ToggleGroup<Id | typeof all>
        value={[value ?? all]}
        onValueChange={([next]) => {
          if (next === undefined) return
          onValueChange(next === all ? undefined : next)
        }}
        variant="outline"
        size="sm"
        className="w-max"
      >
        <ToggleGroupItem value={all}>{allLabel}</ToggleGroupItem>
        {options.map((option) => (
          <ToggleGroupItem key={option.id} value={option.id}>
            {option.name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
