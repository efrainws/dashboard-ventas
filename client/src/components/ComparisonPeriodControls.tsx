import { useState } from "react";
import { CalendarDays, RefreshCcw } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TemporalState } from "@shared/temporalFilterState";
import {
  latestExactDaysComparisonStart,
  previousPeriod,
  suggestedExactDaysComparisonEnd,
  temporalRangeToMonths,
} from "@shared/temporalFilterState";

interface ComparisonPeriodControlsProps {
  value: TemporalState;
  onChange: (next: TemporalState) => void;
  error?: string;
}

function dateFromIso(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function isoFromDate(value: Date | undefined): string | null {
  if (!value) return null;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function lastClosedMonth(): string {
  const now = new Date();
  const previous = new Date(now.getFullYear(), now.getMonth(), 0);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
}

export function ComparisonPeriodControls({ value, onChange, error }: ComparisonPeriodControlsProps) {
  const [selectionNotice, setSelectionNotice] = useState<string>();
  const comparison = value.comparison ?? previousPeriod(value.primary);
  const monthValues = temporalRangeToMonths(value.primary);
  const comparisonMonthValues = temporalRangeToMonths(comparison);
  const latestComparisonStart = latestExactDaysComparisonStart(value.primary);
  const suggestedComparisonEnd = suggestedExactDaysComparisonEnd(value.primary, comparison.start);

  const changeMode = (comparisonMode: TemporalState["comparisonMode"]) => {
    setSelectionNotice(undefined);
    if (comparisonMode === "previous") {
      onChange({ ...value, comparisonMode, comparison: previousPeriod(value.primary) });
      return;
    }
    onChange({ ...value, comparisonMode, comparison });
  };

  const updateComparisonDate = (key: "start" | "end", date: Date | undefined) => {
    const parsed = isoFromDate(date);
    if (!parsed) return;

    if (key === "start") {
      if (parsed > latestComparisonStart) {
        setSelectionNotice("El comparativo debe finalizar antes del período principal y conservar la misma duración.");
        return;
      }
      const end = suggestedExactDaysComparisonEnd(value.primary, parsed);
      setSelectionNotice(`Fecha final propuesta: ${end}. Mantiene la misma duración y no se solapa con el período principal.`);
      onChange({ ...value, comparison: { start: parsed, end } });
      return;
    }

    const requiredEnd = suggestedExactDaysComparisonEnd(value.primary, comparison.start);
    if (parsed !== requiredEnd) {
      setSelectionNotice(`La fecha final debe ser ${requiredEnd} para conservar la duración exacta; se ajustó automáticamente.`);
    } else {
      setSelectionNotice(undefined);
    }
    onChange({ ...value, comparison: { ...comparison, end: requiredEnd } });
  };

  const updateMonthRange = (target: "primary" | "comparison", key: "start" | "end", month: string) => {
    if (!month) return;
    const current = target === "primary" ? monthValues : comparisonMonthValues;
    const startMonth = key === "start" ? month : current?.startMonth ?? month;
    const endMonth = key === "end" ? month : current?.endMonth ?? month;
    const start = new Date(`${startMonth}-01T12:00:00`);
    const end = new Date(`${endMonth}-01T12:00:00`);
    const range = target === "primary"
      ? { start: `${startMonth}-01`, end: new Date(end.getFullYear(), end.getMonth() + 1, 0).toISOString().slice(0, 10) }
      : { start: `${startMonth}-01`, end: new Date(end.getFullYear(), end.getMonth() + 1, 0).toISOString().slice(0, 10) };
    onChange(target === "primary" ? { ...value, primary: range } : { ...value, comparison: range });
  };

  return (
    <div className="mt-4 border-t border-border pt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarDays className="h-4 w-4 text-primary" />
        <p className="ff-section-label">Periodo comparativo</p>
        <Select value={value.comparisonMode} onValueChange={mode => changeMode(mode as TemporalState["comparisonMode"])}>
          <SelectTrigger className="h-9 min-w-[15rem] sm:ml-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="previous">Periodo inmediatamente anterior</SelectItem>
            <SelectItem value="days">Rango de días exacto</SelectItem>
            <SelectItem value="months">Meses completos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {value.comparisonMode === "previous" && (
        <div className="flex items-start gap-2 rounded-none bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <RefreshCcw className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Se comparará automáticamente con {comparison.start} al {comparison.end}, con la misma duración del período principal.
          </span>
        </div>
      )}

      {value.comparisonMode === "days" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Inicio de comparación</Label>
            <DatePicker
              date={dateFromIso(comparison.start)}
              onDateChange={date => updateComparisonDate("start", date)}
              placeholder="Fecha inicio comparativa"
              maxDate={dateFromIso(latestComparisonStart)}
            />
          </div>
          <div className="space-y-2">
            <Label>Fin de comparación</Label>
            <DatePicker
              date={dateFromIso(suggestedComparisonEnd)}
              onDateChange={date => updateComparisonDate("end", date)}
              placeholder="Fecha fin comparativa"
              minDate={dateFromIso(suggestedComparisonEnd)}
              maxDate={dateFromIso(suggestedComparisonEnd)}
            />
          </div>
          <p className="md:col-span-2 text-xs text-muted-foreground" role="status">
            La fecha final se propone automáticamente para igualar la duración del período principal: {suggestedComparisonEnd}.
          </p>
        </div>
      )}

      {value.comparisonMode === "months" && (
        <div className="grid gap-4 md:grid-cols-2">
          <fieldset className="grid gap-3 border border-border p-3">
            <legend className="px-1 text-sm font-medium">Bloque principal</legend>
            <label className="grid gap-1 text-sm text-muted-foreground">
              Mes inicial
              <input
                type="month"
                value={monthValues?.startMonth ?? ""}
                max={lastClosedMonth()}
                onChange={event => updateMonthRange("primary", "start", event.target.value)}
                className="ff-month-input"
              />
            </label>
            <label className="grid gap-1 text-sm text-muted-foreground">
              Mes final
              <input
                type="month"
                value={monthValues?.endMonth ?? ""}
                max={lastClosedMonth()}
                onChange={event => updateMonthRange("primary", "end", event.target.value)}
                className="ff-month-input"
              />
            </label>
          </fieldset>
          <fieldset className="grid gap-3 border border-border p-3">
            <legend className="px-1 text-sm font-medium">Bloque comparativo</legend>
            <label className="grid gap-1 text-sm text-muted-foreground">
              Mes inicial
              <input
                type="month"
                value={comparisonMonthValues?.startMonth ?? ""}
                max={lastClosedMonth()}
                onChange={event => updateMonthRange("comparison", "start", event.target.value)}
                className="ff-month-input"
              />
            </label>
            <label className="grid gap-1 text-sm text-muted-foreground">
              Mes final
              <input
                type="month"
                value={comparisonMonthValues?.endMonth ?? ""}
                max={lastClosedMonth()}
                onChange={event => updateMonthRange("comparison", "end", event.target.value)}
                className="ff-month-input"
              />
            </label>
          </fieldset>
        </div>
      )}

      {(selectionNotice || error) && <p role={error ? "alert" : "status"} className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{error ?? selectionNotice}</p>}
    </div>
  );
}
