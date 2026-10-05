import { inclusiveCalendarDays } from "./analytics";

export type SalesTemporalPageId =
  | "P01"
  | "P02"
  | "P03"
  | "P04"
  | "P05"
  | "P06"
  | "P07"
  | "P08"
  | "P09"
  | "P10"
  | "P11";

export type ComparisonMode = "previous" | "days" | "months";

export interface TemporalRange {
  start: string;
  end: string;
}

export interface TemporalState {
  primary: TemporalRange;
  comparison?: TemporalRange;
  comparisonMode: ComparisonMode;
}

export interface MonthRange {
  startMonth: string;
  endMonth: string;
}

export const TEMPORAL_QUERY_KEYS = [
  "fecha_min",
  "fecha_max",
  "modalidad_comparacion",
  "comparacion_fecha_min",
  "comparacion_fecha_max",
  "meses_principales",
  "meses_comparativos",
  "aviso_periodo",
] as const;

const COMPARATIVE_PAGES = new Set<SalesTemporalPageId>([
  "P01",
  "P02",
  "P04",
  "P05",
  "P06",
  "P07",
]);

const GROUPS: SalesTemporalPageId[][] = [
  ["P01", "P02", "P04"],
  ["P06", "P07"],
  ["P03", "P08", "P09", "P10", "P11"],
];

function toIsoLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIso(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function shiftIso(value: string, days: number): string {
  const parsed = parseIso(value);
  if (!parsed) throw new Error("Fecha ISO inválida");
  parsed.setDate(parsed.getDate() + days);
  return toIsoLocal(parsed);
}

function firstDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function lastDayOfPreviousMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 0, 12);
}

export function todayIso(now = new Date()): string {
  return toIsoLocal(now);
}

export function yesterdayIso(now = new Date()): string {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return toIsoLocal(yesterday);
}

export function isValidIsoDate(value: string | null | undefined): value is string {
  if (!value) return false;
  return parseIso(value) !== null;
}

export function isRangeValid(range: TemporalRange, maxDate = todayIso()): boolean {
  return (
    isValidIsoDate(range.start) &&
    isValidIsoDate(range.end) &&
    range.start <= range.end &&
    range.end <= maxDate
  );
}

export function isComparativePage(pageId: SalesTemporalPageId): boolean {
  return COMPARATIVE_PAGES.has(pageId);
}

export function sameTemporalGroup(from: SalesTemporalPageId, to: SalesTemporalPageId): boolean {
  return GROUPS.some(group => group.includes(from) && group.includes(to));
}

export function defaultTemporalRange(pageId: SalesTemporalPageId, now = new Date()): TemporalRange {
  const today = todayIso(now);
  const yesterday = yesterdayIso(now);

  if (["P03", "P08", "P09", "P10", "P11"].includes(pageId)) {
    if (now.getDate() === 1) {
      const end = toIsoLocal(lastDayOfPreviousMonth(now));
      const start = toIsoLocal(firstDayOfMonth(lastDayOfPreviousMonth(now)));
      return { start, end };
    }
    return { start: toIsoLocal(firstDayOfMonth(now)), end: yesterday };
  }

  if (pageId === "P05") {
    return { start: shiftIso(today, -30), end: today };
  }

  if (["P06", "P07"].includes(pageId)) {
    return { start: shiftIso(yesterday, -14), end: yesterday };
  }

  return { start: shiftIso(yesterday, -29), end: yesterday };
}

export function previousPeriod(range: TemporalRange): TemporalRange {
  const dayCount = inclusiveCalendarDays(range.start, range.end);
  const end = shiftIso(range.start, -1);
  return { start: shiftIso(end, -(dayCount - 1)), end };
}

export function validateExactDaysComparison(primary: TemporalRange, comparison: TemporalRange, maxDate = todayIso()): string | null {
  if (!isRangeValid(primary, maxDate) || !isRangeValid(comparison, maxDate)) {
    return "Selecciona nuevamente el periodo comparativo.";
  }
  if (inclusiveCalendarDays(primary.start, primary.end) !== inclusiveCalendarDays(comparison.start, comparison.end)) {
    return "El periodo comparativo debe tener la misma cantidad de días que el periodo principal.";
  }
  if (comparison.start >= primary.start) {
    return "El periodo comparativo debe comenzar antes del período principal.";
  }
  return null;
}

function parseMonth(month: string): Date | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, value] = month.split("-").map(Number);
  if (value < 1 || value > 12) return null;
  return new Date(year, value - 1, 1, 12);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthCount(range: MonthRange): number | null {
  const start = parseMonth(range.startMonth);
  const end = parseMonth(range.endMonth);
  if (!start || !end || start > end) return null;
  return (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;
}

export function monthsToTemporalRange(range: MonthRange): TemporalRange | null {
  const start = parseMonth(range.startMonth);
  const end = parseMonth(range.endMonth);
  if (!start || !end || start > end) return null;
  const finalDay = new Date(end.getFullYear(), end.getMonth() + 1, 0, 12);
  return { start: toIsoLocal(start), end: toIsoLocal(finalDay) };
}

export function temporalRangeToMonths(range: TemporalRange): MonthRange | null {
  const start = parseIso(range.start);
  const end = parseIso(range.end);
  if (!start || !end) return null;
  const isFirst = start.getDate() === 1;
  const isLast = end.getDate() === new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
  if (!isFirst || !isLast) return null;
  return { startMonth: monthKey(start), endMonth: monthKey(end) };
}

export function validateMonthComparison(primary: MonthRange, comparison: MonthRange, maxDate = todayIso()): string | null {
  const primaryCount = monthCount(primary);
  const comparisonCount = monthCount(comparison);
  const mainRange = monthsToTemporalRange(primary);
  const compareRange = monthsToTemporalRange(comparison);
  if (!primaryCount || !comparisonCount || !mainRange || !compareRange || !isRangeValid(mainRange, maxDate) || !isRangeValid(compareRange, maxDate)) {
    return "Selecciona nuevamente el periodo comparativo.";
  }
  if (primaryCount !== comparisonCount) {
    return "Ambos bloques mensuales deben tener la misma cantidad de meses completos.";
  }
  if (compareRange.start >= mainRange.start) {
    return "El periodo comparativo debe comenzar antes del período principal.";
  }
  return null;
}

export function serializeTemporalState(baseSearch: string, state: TemporalState): string {
  const params = new URLSearchParams(baseSearch);
  TEMPORAL_QUERY_KEYS.forEach(key => params.delete(key));
  params.set("fecha_min", state.primary.start);
  params.set("fecha_max", state.primary.end);

  if (state.comparison && state.comparisonMode !== "previous") {
    params.set("modalidad_comparacion", state.comparisonMode);
    if (state.comparisonMode === "months") {
      const primaryMonths = temporalRangeToMonths(state.primary);
      const comparisonMonths = temporalRangeToMonths(state.comparison);
      if (primaryMonths && comparisonMonths) {
        params.set("meses_principales", `${primaryMonths.startMonth},${primaryMonths.endMonth}`);
        params.set("meses_comparativos", `${comparisonMonths.startMonth},${comparisonMonths.endMonth}`);
      }
    } else {
      params.set("comparacion_fecha_min", state.comparison.start);
      params.set("comparacion_fecha_max", state.comparison.end);
    }
  }
  return params.toString();
}

function parseMonthPair(value: string | null): MonthRange | null {
  if (!value) return null;
  const [startMonth, endMonth, extra] = value.split(",");
  if (!startMonth || !endMonth || extra) return null;
  return { startMonth, endMonth };
}

export function parseTemporalState(pageId: SalesTemporalPageId, search: string, now = new Date()): { state: TemporalState; issue?: string } {
  const params = new URLSearchParams(search);
  const defaultPrimary = defaultTemporalRange(pageId, now);
  const candidate: TemporalRange = {
    start: params.get("fecha_min") ?? defaultPrimary.start,
    end: params.get("fecha_max") ?? defaultPrimary.end,
  };
  const primary = isRangeValid(candidate, todayIso(now)) ? candidate : defaultPrimary;
  const isComparative = isComparativePage(pageId);
  if (!isComparative) return { state: { primary, comparisonMode: "previous" } };

  const mode = params.get("modalidad_comparacion") as ComparisonMode | null;
  if (mode === "days") {
    const comparison = { start: params.get("comparacion_fecha_min") ?? "", end: params.get("comparacion_fecha_max") ?? "" };
    const issue = validateExactDaysComparison(primary, comparison, todayIso(now));
    return issue
      ? { state: { primary, comparisonMode: "previous" }, issue }
      : { state: { primary, comparison, comparisonMode: "days" } };
  }

  if (mode === "months") {
    const primaryMonths = parseMonthPair(params.get("meses_principales"));
    const comparisonMonths = parseMonthPair(params.get("meses_comparativos"));
    if (primaryMonths && comparisonMonths) {
      const issue = validateMonthComparison(primaryMonths, comparisonMonths, todayIso(now));
      const parsedPrimary = monthsToTemporalRange(primaryMonths);
      const parsedComparison = monthsToTemporalRange(comparisonMonths);
      if (!issue && parsedPrimary && parsedComparison) {
        return { state: { primary: parsedPrimary, comparison: parsedComparison, comparisonMode: "months" } };
      }
    }
    return {
      state: { primary, comparisonMode: "previous" },
      issue: "Selecciona nuevamente el periodo comparativo.",
    };
  }

  return { state: { primary, comparison: previousPeriod(primary), comparisonMode: "previous" } };
}

export function buildTemporalNavigationHref(
  destinationPath: string,
  fromPage: SalesTemporalPageId,
  toPage: SalesTemporalPageId,
  currentSearch: string,
  now = new Date(),
): string {
  const params = new URLSearchParams(currentSearch);
  TEMPORAL_QUERY_KEYS.forEach(key => params.delete(key));
  if (sameTemporalGroup(fromPage, toPage)) {
    const { state } = parseTemporalState(fromPage, currentSearch, now);
    const serialized = serializeTemporalState(params.toString(), state);
    const result = new URLSearchParams(serialized);
    result.set("aviso_periodo", "conservado");
    return `${destinationPath}?${result.toString()}`;
  }
  const primary = defaultTemporalRange(toPage, now);
  params.set("fecha_min", primary.start);
  params.set("fecha_max", primary.end);
  params.set("aviso_periodo", "predeterminado");
  return `${destinationPath}?${params.toString()}`;
}
