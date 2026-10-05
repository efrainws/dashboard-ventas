import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inclusiveCalendarDays } from "@shared/analytics";
import { type TemporalState, monthsToTemporalRange, previousPeriod, temporalRangeToMonths } from "@shared/temporalFilterState";
import { chooseShelfMonth, shiftShelfDay } from "./shelfComparison";

const asDate = (iso: string) => new Date(`${iso}T12:00:00`);
const asIso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const monthNumber = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
const monthName = (key: string) => new Date(`${key}-01T12:00:00`).toLocaleString("es-PE", { month: "short", year: "numeric" });
const monthKeys = (start: string, end: string) => Array.from({ length: monthNumber(end) - monthNumber(start) + 1 }, (_, i) => {
  const month = monthNumber(start) + i;
  return `${Math.floor(month / 12)}-${String(month % 12 + 1).padStart(2, "0")}`;
});

function ShelfMonthMultiSelect({ label, selected, onSelect, onInvalid }: {
  label: string;
  selected: { startMonth: string; endMonth: string } | null;
  onSelect: (month: string) => void;
  onInvalid: (message: string) => void;
}) {
  const now = new Date();
  const lastClosed = new Date(now.getFullYear(), now.getMonth(), 0);
  const end = asIso(lastClosed).slice(0, 7);
  const months = monthKeys("2018-01", end).reverse();
  const count = selected ? monthNumber(selected.endMonth) - monthNumber(selected.startMonth) + 1 : 0;
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start text-left font-normal" type="button">
            {selected ? `${monthName(selected.startMonth)} – ${monthName(selected.endMonth)} (${count} ${count === 1 ? "mes" : "meses"})` : "Seleccionar meses completos"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="max-h-72 w-72 overflow-y-auto bg-popover text-popover-foreground">
          <p className="mb-2 text-xs text-muted-foreground">Solo meses cerrados y consecutivos.</p>
          {months.map(month => {
            const checked = !!selected && month >= selected.startMonth && month <= selected.endMonth;
            return <button key={month} type="button" role="checkbox" aria-checked={checked}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted"
              onClick={() => {
                if (selected && !checked && month !== shiftMonth(selected.startMonth, -1) && month !== shiftMonth(selected.endMonth, 1)) {
                  onInvalid("Los meses seleccionados deben ser consecutivos."); return;
                }
                onSelect(month);
              }}>
              <Checkbox checked={checked} tabIndex={-1} aria-hidden="true" /> {monthName(month)}
            </button>;
          })}
        </PopoverContent>
      </Popover>
    </div>
  );
}
function shiftMonth(month: string, offset: number) {
  const next = monthNumber(month) + offset;
  return `${Math.floor(next / 12)}-${String(next % 12 + 1).padStart(2, "0")}`;
}

export function ShelfPeriodControls({ value, onChange, error }: {
  value: TemporalState; onChange: (next: TemporalState) => void; error?: string;
}) {
  const [hover, setHover] = useState<Date>();
  const [localError, setLocalError] = useState<string>();
  const count = inclusiveCalendarDays(value.primary.start, value.primary.end);
  const candidate = hover && asIso(hover) < value.primary.start && asIso(hover) >= "2018-01-01"
    ? { from: hover, to: asDate(shiftShelfDay(asIso(hover), count - 1)) }
    : undefined;
  const selected = candidate ?? (value.comparison ? { from: asDate(value.comparison.start), to: asDate(value.comparison.end) } : undefined);
  const monthMain = temporalRangeToMonths(value.primary);
  const monthCompare = value.comparison ? temporalRangeToMonths(value.comparison) : null;
  const chooseMode = (mode: TemporalState["comparisonMode"]) => {
    setLocalError(undefined);
    if (mode === "months") {
      const now = new Date();
      const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 12);
      const month = asIso(previousMonth).slice(0, 7);
      const primary = monthsToTemporalRange({ startMonth: month, endMonth: month })!;
      onChange({ primary, comparison: previousPeriod(primary), comparisonMode: mode });
    } else {
      onChange({ ...value, comparisonMode: mode, comparison: mode === "previous" ? previousPeriod(value.primary) : value.comparison ?? previousPeriod(value.primary) });
    }
  };
  const selectMonth = (target: "primary" | "comparison", month: string) => {
    const next = chooseShelfMonth(value, target, month);
    if (!next) { setLocalError("Selecciona meses consecutivos; conserva al menos un mes por periodo."); return; }
    setLocalError(undefined);
    onChange(next);
  };
  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <CalendarDays className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Periodo comparativo</span>
        <Select value={value.comparisonMode} onValueChange={mode => chooseMode(mode as TemporalState["comparisonMode"])}>
          <SelectTrigger className="sm:ml-auto w-full sm:w-64" aria-label="Modalidad de comparación"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="previous">Periodo inmediatamente anterior</SelectItem>
            <SelectItem value="days">Días exactos</SelectItem>
            <SelectItem value="months">Meses completos</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {value.comparisonMode === "previous" && <p className="text-xs text-muted-foreground">{value.comparison?.start} al {value.comparison?.end}; misma cantidad de fechas que el principal.</p>}
      {value.comparisonMode === "days" && <div className="space-y-2">
        <Label>Fecha inicial comparativa · {count} fechas inclusivas</Label>
        <p className="text-xs text-muted-foreground">Selecciona solo la fecha inicial. El fin se calcula automáticamente; se permite traslape parcial.</p>
        <Popover>
          <PopoverTrigger asChild><Button type="button" variant="outline" className="w-full justify-start sm:w-72">
            {value.comparison ? `${value.comparison.start} – ${value.comparison.end}` : "Seleccionar fecha inicial"}
          </Button></PopoverTrigger>
          <PopoverContent align="start" className="w-auto bg-popover p-0 text-popover-foreground">
            <Calendar mode="range" selected={selected} onDayMouseEnter={setHover} onDayMouseLeave={() => setHover(undefined)}
              onDayClick={date => {
                const start = asIso(date);
                if (start >= value.primary.start || start < "2018-01-01") return;
                onChange({ ...value, comparison: { start, end: shiftShelfDay(start, count - 1) } });
                setHover(undefined); setLocalError(undefined);
              }}
              disabled={[{ before: asDate("2018-01-01") }, { after: asDate(shiftShelfDay(value.primary.start, -1)) }]}
              defaultMonth={value.comparison ? asDate(value.comparison.start) : asDate(value.primary.start)} />
          </PopoverContent>
        </Popover>
      </div>}
      {value.comparisonMode === "months" && <div className="grid gap-3 md:grid-cols-2">
        <ShelfMonthMultiSelect label="Meses principales" selected={monthMain} onSelect={month => selectMonth("primary", month)} onInvalid={setLocalError} />
        <ShelfMonthMultiSelect label="Meses comparativos" selected={monthCompare} onSelect={month => selectMonth("comparison", month)} onInvalid={setLocalError} />
      </div>}
      {(error || localError || !value.comparison) && <p role="alert" className="text-sm text-destructive">{localError || error || "Selecciona nuevamente el periodo comparativo."}</p>}
    </div>
  );
}
