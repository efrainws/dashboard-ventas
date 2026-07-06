import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HeatmapSkeleton } from "@/components/SalesSkeletons";
import { trpc } from "@/lib/trpc";

// ─── Constantes ────────────────────────────────────────────────────────────────

const DAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DAYS_FULL  = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const ALL_HOURS  = Array.from({ length: 24 }, (_, i) => i);

// Número de semanas hacia atrás (extensible a 8, 12, 16 cambiando esta constante)
const WEEKS_BACK = 6;

// Paleta Flora & Fauna: Cobalto → Esmeralda → Mostaza → Granate
const COLOR_STOPS = [
  { pct: 0,    color: [26,  104, 148] },
  { pct: 0.33, color: [0,   128, 100] },
  { pct: 0.66, color: [196, 151,   5] },
  { pct: 1,    color: [188,  44,  70] },
];

function interpolateColor(value: number, min: number, max: number): string {
  if (max === min) return `rgb(${COLOR_STOPS[0].color.join(",")})`;
  if (value <= 0)  return "var(--muted)";
  const pct = (value - min) / (max - min);
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const lo = COLOR_STOPS[i], hi = COLOR_STOPS[i + 1];
    if (pct >= lo.pct && pct <= hi.pct) {
      const t = (pct - lo.pct) / (hi.pct - lo.pct);
      const r = Math.round(lo.color[0] + t * (hi.color[0] - lo.color[0]));
      const g = Math.round(lo.color[1] + t * (hi.color[1] - lo.color[1]));
      const b = Math.round(lo.color[2] + t * (hi.color[2] - lo.color[2]));
      return `rgb(${r},${g},${b})`;
    }
  }
  return `rgb(${COLOR_STOPS[COLOR_STOPS.length - 1].color.join(",")})`;
}

function formatValue(value: number, metric: "amount" | "transactions"): string {
  if (metric === "amount") {
    if (value >= 1_000_000) return `S/ ${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000)     return `S/ ${(value / 1_000).toFixed(1)}k`;
    return `S/ ${value.toFixed(0)}`;
  }
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

/** Formatea YYYY-MM-DD → DD/MM */
function formatDateLabel(d: string): string {
  const [, mm, dd] = d.split("-");
  return `${dd}/${mm}`;
}

// ─── Tipos ─────────────────────────────────────────────────────────────────────

interface HeatmapChartProps {
  fechaMin: string;
  fechaMax: string;
  branchId?: string;
  includeIgv?: boolean;
}

type HeatmapMode = "weekly" | "day_comparison";

interface TooltipState {
  rowLabel: string;
  hour: number;   // -1 = sin hora
  value: number;
  avg?: number;
  x: number;
  y: number;
  // Campos extra para modo comparación
  fullDate?: string;
  dayName?: string;
}

// ─── Componente ────────────────────────────────────────────────────────────────

export function HeatmapChart({ fechaMin, fechaMax, branchId, includeIgv = true }: HeatmapChartProps) {
  const [metric, setMetric]           = useState<"amount" | "transactions">("amount");
  const [mode, setMode]               = useState<HeatmapMode>("weekly");
  const [selectedDay, setSelectedDay] = useState<number>(1); // 1 = Lunes por defecto
  const [tooltip, setTooltip]         = useState<TooltipState | null>(null);

  const enabled = !!fechaMin && !!fechaMax;

  // ── Query modo semanal ──────────────────────────────────────────────────────
  const weeklyQuery = trpc.sales.getHeatmapData.useQuery(
    { fecha_min: fechaMin, fecha_max: fechaMax, branch_id: branchId, metric, include_igv: includeIgv },
    { enabled: enabled && mode === "weekly" }
  );

  // ── Query modo comparación ──────────────────────────────────────────────────
  const compQuery = trpc.sales.getHeatmapDayComparison.useQuery(
    {
      base_date: fechaMax.substring(0, 10),
      day_of_week: selectedDay,
      weeks_back: WEEKS_BACK,
      branch_id: branchId,
      metric,
      include_igv: includeIgv,
    },
    { enabled: enabled && mode === "day_comparison" }
  );

  // ── Matriz modo semanal: 7 filas (días) × 25 cols (horas 0-23 + "sin hora") ─
  // Índice 24 en la matriz = columna "Sin hora" (hour_of_day = -1 en BD)
  const SIN_HORA_IDX = 24; // posición en la matriz para registros sin hora

  const weeklyMatrix = useMemo(() => {
    // 7 días × 25 slots (0-23 + sin hora)
    const m: (number | null)[][] = Array.from({ length: 7 }, () => Array(25).fill(null));
    if (!weeklyQuery.data?.data) return m;
    for (const row of weeklyQuery.data.data) {
      const v = parseFloat(row.value as unknown as string);
      if (isNaN(v)) continue;
      const col = row.hour_of_day === -1 ? SIN_HORA_IDX : row.hour_of_day;
      if (col >= 0 && col < 25) {
        m[row.day_of_week][col] = v;
      }
    }
    return m;
  }, [weeklyQuery.data]);

  // ── Matriz modo comparación: N filas (fechas) × 25 cols ────────────────────
  const { compMatrix, compRowLabels, compFullDates } = useMemo(() => {
    const targetDates = compQuery.data?.target_dates ?? [];
    const matrix: (number | null)[][] = targetDates.map(() => Array(25).fill(null));
    const rowLabels: string[] = targetDates.map(d => {
      const dayName = DAYS_SHORT[new Date(d + "T12:00:00Z").getUTCDay()];
      return `${dayName} ${formatDateLabel(d)}`;
    });
    const fullDates: string[] = targetDates.map(d => {
      const dayName = DAYS_FULL[new Date(d + "T12:00:00Z").getUTCDay()];
      return `${dayName} ${formatDateLabel(d)}`;
    });
    if (compQuery.data?.data) {
      for (const row of compQuery.data.data) {
        const rowIdx = targetDates.indexOf(row.date_label);
        if (rowIdx >= 0) {
          const v = parseFloat(row.value as unknown as string);
          const col = row.hour_of_day === -1 ? SIN_HORA_IDX : row.hour_of_day;
          if (!isNaN(v) && col >= 0 && col < 25) {
            matrix[rowIdx][col] = v;
          }
        }
      }
    }
    return { compMatrix: matrix, compRowLabels: rowLabels, compFullDates: fullDates };
  }, [compQuery.data]);

  // ── Promedio por hora en modo comparación (para tooltip) ───────────────────
  const compHourAvg = useMemo(() => {
    return Array.from({ length: 25 }, (_, col) => {
      const vals = compMatrix.map(row => row[col]).filter((v): v is number => v !== null && v > 0);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    });
  }, [compMatrix]);

  // ── Días activos en modo semanal (solo días con al menos un valor > 0) ──────
  const activeWeekDays = useMemo(() => {
    return [0, 1, 2, 3, 4, 5, 6].filter(day =>
      Array.from({ length: 25 }, (_, col) => col).some(col => (weeklyMatrix[day][col] ?? 0) > 0)
    );
  }, [weeklyMatrix]);

  // ── Selección de matriz activa ──────────────────────────────────────────────
  const activeMatrix = useMemo(() =>
    mode === "weekly"
      ? activeWeekDays.map(day => weeklyMatrix[day])
      : compMatrix,
    [mode, activeWeekDays, weeklyMatrix, compMatrix]
  );
  const activeRowCount = mode === "weekly" ? activeWeekDays.length : compMatrix.length;
  const activeRowLabel = (idx: number) =>
    mode === "weekly" ? DAYS_SHORT[activeWeekDays[idx]] : (compRowLabels[idx] ?? "");

  // ── Columnas activas: horas 0-23 con datos + columna "Sin hora" si hay datos ─
  // Representamos las columnas como índices 0-24 (24 = sin hora)
  const activeColumns = useMemo(() => {
    const cols = ALL_HOURS.filter(h => activeMatrix.some(row => (row[h] ?? 0) > 0));
    // Agregar columna "Sin hora" al final si tiene datos
    if (activeMatrix.some(row => (row[SIN_HORA_IDX] ?? 0) > 0)) {
      cols.push(SIN_HORA_IDX);
    }
    return cols;
  }, [activeMatrix]);

  // ── Escala de color ─────────────────────────────────────────────────────────
  const { minVal, maxVal } = useMemo(() => {
    const vals = activeMatrix.flat().filter((v): v is number => v !== null && v > 0);
    return { minVal: Math.min(...vals, 0), maxVal: Math.max(...vals, 1) };
  }, [activeMatrix]);

  // ── Totales por columna (fila inferior) ────────────────────────────────────
  const colTotals = useMemo(() =>
    Array.from({ length: 25 }, (_, col) =>
      activeMatrix.reduce((sum, row) => sum + (row[col] ?? 0), 0)
    ),
    [activeMatrix]
  );
  const maxColTotal = Math.max(...activeColumns.map(col => colTotals[col]), 1);

  // ── Estado de carga / error ─────────────────────────────────────────────────
  const isLoading = mode === "weekly" ? weeklyQuery.isLoading : compQuery.isLoading;
  const hasError  = mode === "weekly" ? !!weeklyQuery.error   : !!compQuery.error;
  const hasData   = mode === "weekly"
    ? (weeklyQuery.data?.data?.length ?? 0) > 0
    : (compQuery.data?.data?.length ?? 0) > 0;

  // ── Título dinámico ─────────────────────────────────────────────────────────
  const chartTitle = mode === "weekly"
    ? "Mapa de Calor — Actividad por Día y Hora"
    : `Comparación de ${DAYS_FULL[selectedDay]} — últimas ${WEEKS_BACK} semanas`;

  // ── Helper: etiqueta de columna ─────────────────────────────────────────────
  const colLabel = (col: number) =>
    col === SIN_HORA_IDX ? "S/H" : String(col).padStart(2, "0");

  const colTooltipLabel = (col: number) =>
    col === SIN_HORA_IDX ? "Sin hora registrada" : `${String(col).padStart(2, "0")}:00 – ${String(col + 1).padStart(2, "0")}:00`;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3">
          {/* Título + toggle métrica */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold">{chartTitle}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Intensidad de{" "}
                {metric === "amount" ? "ventas (S/)" : "transacciones"} por franja horaria
              </p>
            </div>
            <div className="flex gap-1 p-1 rounded-lg bg-muted self-start">
              <Button size="sm" variant={metric === "amount" ? "default" : "ghost"}
                className="h-7 px-3 text-xs" onClick={() => setMetric("amount")}>
                Monto (S/)
              </Button>
              <Button size="sm" variant={metric === "transactions" ? "default" : "ghost"}
                className="h-7 px-3 text-xs" onClick={() => setMetric("transactions")}>
                Transacciones
              </Button>
            </div>
          </div>

          {/* Selector de modo */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex gap-1 p-1 rounded-lg bg-muted">
              <Button size="sm"
                variant={mode === "weekly" ? "default" : "ghost"}
                className="h-7 px-3 text-xs"
                onClick={() => setMode("weekly")}>
                Semana completa
              </Button>
              <Button size="sm"
                variant={mode === "day_comparison" ? "default" : "ghost"}
                className="h-7 px-3 text-xs"
                onClick={() => setMode("day_comparison")}>
                Día específico — últimas {WEEKS_BACK} semanas
              </Button>
            </div>

            {/* Selector de día (solo visible en modo comparación) */}
            {mode === "day_comparison" && (
              <div className="flex gap-1 flex-wrap">
                {DAYS_FULL.map((dayName, idx) => (
                  <Button key={idx} size="sm"
                    variant={selectedDay === idx ? "default" : "outline"}
                    className="h-7 px-2 text-xs"
                    onClick={() => setSelectedDay(idx)}>
                    {DAYS_SHORT[idx]}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Carga */}
        {isLoading && <HeatmapSkeleton />}

        {/* Error */}
        {hasError && !isLoading && (
          <div className="flex items-center justify-center h-48 text-destructive text-sm">
            Error al cargar el mapa de calor
          </div>
        )}

        {/* Sin datos */}
        {!isLoading && !hasError && enabled && !hasData && (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            Sin datos para el período seleccionado
          </div>
        )}

        {/* Sin filtros */}
        {!enabled && (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            Selecciona un rango de fechas para ver el mapa de calor
          </div>
        )}

        {/* ── Mapa de calor ─────────────────────────────────────────────────── */}
        {!isLoading && !hasError && enabled && hasData && (
          <div className="relative overflow-x-auto">

            {/* Tooltip flotante */}
            {tooltip && (
              <div
                className="pointer-events-none fixed z-50 rounded-md border bg-popover px-3 py-2 text-xs shadow-md max-w-[220px]"
                style={{ left: tooltip.x + 14, top: tooltip.y - 50 }}
              >
                {/* Modo comparación: mostrar fecha completa y día */}
                {mode === "day_comparison" && tooltip.fullDate && (
                  <div className="font-semibold mb-0.5">{tooltip.fullDate}</div>
                )}
                {/* Modo semanal: mostrar día de semana */}
                {mode === "weekly" && (
                  <div className="font-semibold mb-0.5">{tooltip.rowLabel}</div>
                )}
                <div className="text-muted-foreground">
                  {colTooltipLabel(tooltip.hour)}
                </div>
                <div className="text-primary font-bold mt-0.5">
                  {formatValue(tooltip.value, metric)}
                </div>
                {/* Comparación vs promedio (solo en modo comparación) */}
                {mode === "day_comparison" && tooltip.avg != null && tooltip.avg > 0 && (
                  <div className="text-muted-foreground mt-0.5">
                    Prom. {WEEKS_BACK} sem: {formatValue(tooltip.avg, metric)}
                    {" "}
                    <span className={tooltip.value >= tooltip.avg ? "text-emerald-600" : "text-red-500"}>
                      ({tooltip.value >= tooltip.avg ? "+" : ""}
                      {(((tooltip.value - tooltip.avg) / tooltip.avg) * 100).toFixed(1)}%)
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="min-w-[400px]">
              {/* Cabecera de columnas */}
              <div className="flex items-center mb-1">
                <div className="w-20 shrink-0" />
                {activeColumns.map((col) => (
                  <div
                    key={col}
                    className={`flex-1 text-center text-[10px] leading-none ${
                      col === SIN_HORA_IDX
                        ? "text-amber-500 font-semibold"
                        : "text-muted-foreground"
                    }`}
                  >
                    {colLabel(col)}
                  </div>
                ))}
              </div>

              {/* Filas */}
              {Array.from({ length: activeRowCount }, (_, rowIdx) => (
                <div key={rowIdx} className="flex items-center mb-0.5">
                  {/* Etiqueta de fila */}
                  <div className="w-20 shrink-0 text-[11px] font-medium text-muted-foreground text-right pr-2 truncate">
                    {activeRowLabel(rowIdx)}
                  </div>

                  {/* Celdas */}
                  {activeColumns.map(col => {
                    const val = activeMatrix[rowIdx]?.[col] ?? null;
                    const isSinHora = col === SIN_HORA_IDX;
                    const bg = val !== null && val > 0
                      ? isSinHora
                        ? "repeating-linear-gradient(45deg, rgba(245,158,11,0.25) 0px, rgba(245,158,11,0.25) 4px, rgba(245,158,11,0.08) 4px, rgba(245,158,11,0.08) 8px)"
                        : interpolateColor(val, minVal, maxVal)
                      : "var(--muted)";
                    const textColor = val !== null && val > 0
                      ? isSinHora ? "#b45309" : "#fff"
                      : "transparent";
                    const avg = mode === "day_comparison" ? (compHourAvg[col] ?? undefined) : undefined;

                    return (
                      <div
                        key={col}
                        className={`flex-1 rounded-[2px] mx-[1px] cursor-default transition-opacity hover:opacity-80 ${
                          isSinHora ? "border border-amber-300/40" : ""
                        }`}
                        style={{ background: bg, height: "clamp(28px, 4vw, 48px)", minWidth: 0 }}
                        onMouseEnter={e => {
                          if (val !== null) {
                            setTooltip({
                              rowLabel: activeRowLabel(rowIdx),
                              hour: col,
                              value: val,
                              avg,
                              x: e.clientX,
                              y: e.clientY,
                              fullDate: mode === "day_comparison" ? compFullDates[rowIdx] : undefined,
                              dayName: mode === "day_comparison" ? DAYS_FULL[selectedDay] : undefined,
                            });
                          }
                        }}
                        onMouseMove={e => {
                          if (val !== null) {
                            setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null);
                          }
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        <span
                          className="leading-none hidden sm:flex items-center justify-center h-full w-full font-medium overflow-hidden"
                          style={{
                            color: textColor,
                            fontSize: "clamp(7px, 1.1vw, 13px)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: "100%",
                            padding: "0 1px",
                          }}
                        >
                          {val !== null && val > 0 ? formatValue(val, metric) : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Separador */}
              <div className="flex items-center mt-2 mb-0.5">
                <div className="w-20 shrink-0" />
                <div className="flex-1 border-t border-border" />
              </div>

              {/* Fila de totales */}
              <div className="flex items-center">
                <div className="w-20 shrink-0 text-[10px] text-muted-foreground text-right pr-2">
                  Total
                </div>
                {activeColumns.map(col => {
                  const v = colTotals[col];
                  const pct = v / maxColTotal;
                  const isSinHora = col === SIN_HORA_IDX;
                  return (
                    <div key={col} className="flex-1 mx-[1px] flex flex-col items-center gap-0.5">
                      <div className="w-full rounded-sm overflow-hidden" style={{ height: 16 }}>
                        <div
                          className="w-full rounded-sm"
                          style={{
                            height: `${Math.max(pct * 100, v > 0 ? 8 : 0)}%`,
                            background: isSinHora ? "rgb(245,158,11)" : "var(--ff-esmeralda)",
                            opacity: 0.7,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Leyenda */}
              <div className="flex items-center gap-2 mt-4 justify-end flex-wrap">
                <span className="text-[10px] text-muted-foreground">Menor</span>
                <div
                  className="h-3 w-32 rounded-sm"
                  style={{
                    background: `linear-gradient(to right, rgb(${COLOR_STOPS[0].color.join(",")}), rgb(${COLOR_STOPS[1].color.join(",")}), rgb(${COLOR_STOPS[2].color.join(",")}), rgb(${COLOR_STOPS[3].color.join(",")}))`,
                  }}
                />
                <span className="text-[10px] text-muted-foreground">Mayor</span>
                <span className="text-[10px] text-muted-foreground ml-2">
                  Máx: {formatValue(maxVal, metric)}
                </span>
                {/* Indicador columna Sin hora */}
                {activeColumns.includes(SIN_HORA_IDX) && (
                  <span className="text-[10px] text-amber-500 ml-2 flex items-center gap-1">
                    <span
                      className="inline-block w-3 h-3 rounded-sm border border-amber-300"
                      style={{
                        background: "repeating-linear-gradient(45deg, rgba(245,158,11,0.35) 0px, rgba(245,158,11,0.35) 3px, rgba(245,158,11,0.1) 3px, rgba(245,158,11,0.1) 6px)",
                      }}
                    />
                    S/H = Sin hora registrada
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
