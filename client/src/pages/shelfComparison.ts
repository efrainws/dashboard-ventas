import { inclusiveCalendarDays } from "@shared/analytics";
import {
  type TemporalRange, type TemporalState, isRangeValid, monthsToTemporalRange,
  temporalRangeToMonths, validateMonthComparison, previousPeriod, todayIso,
} from "@shared/temporalFilterState";

export type ShelfFilters = {
  branch: string;
  category: string;
  shelfStatus: "all" | "sin_registro" | "sin_gondola" | "con_gondola";
  includeIgv: boolean;
};

export function shelfFiltersFromSearch(search: string): ShelfFilters {
  const params = new URLSearchParams(search);
  const status = params.get("shelf_status");
  return {
    branch: params.get("branch_id") || "all",
    category: params.get("category_id") || "all",
    shelfStatus: status === "sin_registro" || status === "sin_gondola" || status === "con_gondola" ? status : "all",
    includeIgv: params.get("include_igv") !== "false",
  };
}

export function shelfFiltersToParams(search: string, filters: ShelfFilters): URLSearchParams {
  const params = new URLSearchParams(search);
  for (const key of ["branch_id", "category_id", "shelf_status", "include_igv"]) params.delete(key);
  if (filters.branch !== "all") params.set("branch_id", filters.branch);
  if (filters.category !== "all") params.set("category_id", filters.category);
  if (filters.shelfStatus !== "all") params.set("shelf_status", filters.shelfStatus);
  if (!filters.includeIgv) params.set("include_igv", "false");
  return params;
}

const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const shiftShelfDay = (date: string, days: number) => {
  const result = new Date(`${date}T12:00:00`);
  result.setDate(result.getDate() + days);
  return iso(result);
};
const realDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && iso(new Date(`${date}T12:00:00`)) === date;

export function validateShelfComparison(state: TemporalState, now = todayIso()): string | null {
  const { primary, comparison } = state;
  if (!realDate(primary.start) || !realDate(primary.end) || !isRangeValid(primary, now)) return "Selecciona un periodo principal válido.";
  if (!comparison || !realDate(comparison.start) || !realDate(comparison.end) ||
      !isRangeValid(comparison, now) || comparison.start < "2018-01-01") return "Selecciona nuevamente el periodo comparativo.";
  if (comparison.start >= primary.start) return "El periodo comparativo debe empezar antes del principal.";
  if (state.comparisonMode === "months") {
    const main = temporalRangeToMonths(primary);
    const other = temporalRangeToMonths(comparison);
    if (!main || !other) return "Selecciona meses completos cerrados y consecutivos.";
    const today = new Date(`${now}T12:00:00`);
    const lastClosed = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    if (main.endMonth >= lastClosed || other.endMonth >= lastClosed) return "Selecciona solamente meses completos cerrados.";
    return validateMonthComparison(main, other, now);
  }
  if (inclusiveCalendarDays(primary.start, primary.end) !== inclusiveCalendarDays(comparison.start, comparison.end)) {
    return "El periodo comparativo debe tener la misma cantidad de días que el principal.";
  }
  return null;
}

export function updateShelfPrimary(state: TemporalState, primary: TemporalRange): TemporalState {
  if (state.comparisonMode === "previous") return { ...state, primary, comparison: previousPeriod(primary) };
  const oldCount = state.comparisonMode === "months" ? monthSpan(state.primary) : inclusiveCalendarDays(state.primary.start, state.primary.end);
  const newCount = state.comparisonMode === "months" ? monthSpan(primary) : inclusiveCalendarDays(primary.start, primary.end);
  if (oldCount !== newCount || !state.comparison) return { ...state, primary, comparison: undefined };
  if (state.comparisonMode === "months") {
    const months = temporalRangeToMonths(state.comparison);
    const mainMonths = temporalRangeToMonths(primary);
    const oldMain = temporalRangeToMonths(state.primary);
    if (!months || !mainMonths || !oldMain) return { ...state, primary, comparison: undefined };
    const offset = monthIndex(mainMonths.startMonth) - monthIndex(oldMain.startMonth);
    const nextStart = monthFromIndex(monthIndex(months.startMonth) + offset);
    const nextEnd = monthFromIndex(monthIndex(months.endMonth) + offset);
    return { ...state, primary, comparison: monthsToTemporalRange({ startMonth: nextStart, endMonth: nextEnd }) ?? undefined };
  }
  const offset = Math.round((Date.parse(`${primary.start}T12:00:00Z`) - Date.parse(`${state.primary.start}T12:00:00Z`)) / 86_400_000);
  return { ...state, primary, comparison: { start: shiftShelfDay(state.comparison.start, offset), end: shiftShelfDay(state.comparison.end, offset) } };
}

const monthIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
const monthFromIndex = (index: number) => `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
const monthSpan = (range: TemporalRange) => {
  const months = temporalRangeToMonths(range);
  return months ? monthIndex(months.endMonth) - monthIndex(months.startMonth) + 1 : 0;
};

export function chooseShelfMonth(state: TemporalState, target: "primary" | "comparison", month: string): TemporalState | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const existing = target === "primary" ? temporalRangeToMonths(state.primary) : state.comparison && temporalRangeToMonths(state.comparison);
  const index = monthIndex(month);
  const selected = existing
    ? Array.from({ length: monthIndex(existing.endMonth) - monthIndex(existing.startMonth) + 1 }, (_, i) => monthIndex(existing.startMonth) + i)
    : [];
  const next = selected.includes(index) ? selected.filter(i => i !== index) : [...selected, index].sort((a, b) => a - b);
  if (!next.length || next.some((value, i) => i > 0 && value !== next[i - 1] + 1)) return null;
  const range = monthsToTemporalRange({ startMonth: monthFromIndex(next[0]), endMonth: monthFromIndex(next[next.length - 1]) });
  if (!range) return null;
  return target === "primary" ? updateShelfPrimary(state, range) : { ...state, comparison: range };
}

export function shelfProductKey(row: { branch_sap_id: string; product_id: string; stock_id: string | null }) {
  return JSON.stringify([row.branch_sap_id, row.product_id, row.stock_id]);
}
export function shelfAggregateKey(row: { branch_sap_id: string; shelf_id: string | null }) {
  return JSON.stringify([row.branch_sap_id, row.shelf_id]);
}
export function shelfRankingKey(row: { product_id: string }) { return row.product_id; }
