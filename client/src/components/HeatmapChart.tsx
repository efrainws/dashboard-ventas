import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

// ─── Constantes ────────────────────────────────────────────────────────────────

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i); // 0-23

// Paleta de colores Flora & Fauna: Cobalto (frío) → Esmeralda → Mostaza → Granate (caliente)
const COLOR_STOPS = [
  { pct: 0,    color: [26,  104, 148] },  // --ff-cobalto     (#1A6894)
  { pct: 0.33, color: [0,   128, 100] },  // --ff-esmeralda   (#008064)
  { pct: 0.66, color: [196, 151,   5] },  // --ff-mostaza     (#C49705)
  { pct: 1,    color: [188,  44,  70] },  // --ff-granate     (#BC2C46)
];

function interpolateColor(value: number, min: number, max: number): string {
  if (max === min) return `rgb(${COLOR_STOPS[0].color.join(",")})`;
  // Celdas sin datos: gris neutro
  if (value <= 0) return "var(--muted)";
  const pct = (value - min) / (max - min);
  // Buscar el segmento correspondiente en los stops
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const lo = COLOR_STOPS[i];
    const hi = COLOR_STOPS[i + 1];
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
    if (value >= 1_000) return `S/ ${(value / 1_000).toFixed(1)}k`;
    return `S/ ${value.toFixed(0)}`;
  }
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

// ─── Tipos ─────────────────────────────────────────────────────────────────────

interface HeatmapChartProps {
  fechaMin: string;
  fechaMax: string;
  branchId?: string;
}

// ─── Componente ────────────────────────────────────────────────────────────────

export function HeatmapChart({ fechaMin, fechaMax, branchId }: HeatmapChartProps) {
  const [metric, setMetric] = useState<"amount" | "transactions">("amount");
  const [tooltip, setTooltip] = useState<{
    day: number; hour: number; value: number; x: number; y: number;
  } | null>(null);

  const enabled = !!fechaMin && !!fechaMax;

  const { data, isLoading, error } = trpc.sales.getHeatmapData.useQuery(
    { fecha_min: fechaMin, fecha_max: fechaMax, branch_id: branchId, metric },
    { enabled }
  );

  // Construir matriz 7×24 con los valores
  const matrix = useMemo(() => {
    const m: (number | null)[][] = Array.from({ length: 7 }, () =>
      Array(24).fill(null)
    );
    if (!data?.data) return m;
    for (const row of data.data) {
      const v = parseFloat(row.value as unknown as string);
      m[row.day_of_week][row.hour_of_day] = isNaN(v) ? null : v;
    }
    return m;
  }, [data]);

  // Horas activas: solo las que tienen al menos un valor > 0 en cualquier día
  const activeHours = useMemo(() =>
    ALL_HOURS.filter(h =>
      matrix.some(row => (row[h] ?? 0) > 0)
    ), [matrix]);

  // Min / max para escala de color (excluyendo nulls y ceros)
  const { minVal, maxVal } = useMemo(() => {
    const vals = matrix.flat().filter((v): v is number => v !== null && v > 0);
    return { minVal: Math.min(...vals, 0), maxVal: Math.max(...vals, 1) };
  }, [matrix]);

  // Totales por hora (todas las horas para indexar correctamente)
  const hourTotals = useMemo(() =>
    ALL_HOURS.map(h =>
      matrix.reduce((sum, row) => sum + (row[h] ?? 0), 0)
    ), [matrix]);

  const maxHourTotal = Math.max(...activeHours.map(h => hourTotals[h]), 1);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold">
              Mapa de Calor — Actividad por Día y Hora
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Intensidad de{" "}
              {metric === "amount" ? "ventas (S/)" : "transacciones"} por franja horaria
            </p>
          </div>

          {/* Toggle métrica */}
          <div className="flex gap-1 p-1 rounded-lg bg-muted self-start sm:self-auto">
            <Button
              size="sm"
              variant={metric === "amount" ? "default" : "ghost"}
              className="h-7 px-3 text-xs"
              onClick={() => setMetric("amount")}
            >
              Monto (S/)
            </Button>
            <Button
              size="sm"
              variant={metric === "transactions" ? "default" : "ghost"}
              className="h-7 px-3 text-xs"
              onClick={() => setMetric("transactions")}
            >
              Transacciones
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Estado de carga */}
        {isLoading && (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
            <span className="text-sm text-muted-foreground">Cargando mapa de calor…</span>
          </div>
        )}

        {/* Estado de error */}
        {error && !isLoading && (
          <div className="flex items-center justify-center h-48 text-destructive text-sm">
            Error al cargar el mapa de calor
          </div>
        )}

        {/* Sin datos */}
        {!isLoading && !error && enabled && (!data?.data || data.data.length === 0) && (
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

        {/* Mapa de calor */}
        {!isLoading && !error && enabled && data?.data && data.data.length > 0 && (
          <div className="relative overflow-x-auto">
            {/* Tooltip flotante */}
            {tooltip && (
              <div
                className="pointer-events-none fixed z-50 rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
                style={{ left: tooltip.x + 12, top: tooltip.y - 40 }}
              >
                <span className="font-semibold">{DAYS[tooltip.day]}</span>
                {" · "}
                <span>{String(tooltip.hour).padStart(2, "0")}:00 – {String(tooltip.hour + 1).padStart(2, "0")}:00</span>
                <br />
                <span className="text-primary font-bold">
                  {formatValue(tooltip.value, metric)}
                </span>
              </div>
            )}

            <div className="min-w-[400px]">
              {/* Cabecera de horas — solo horas activas */}
              <div className="flex items-center mb-1">
                {/* Espacio para etiqueta de día */}
                <div className="w-10 shrink-0" />
                {activeHours.map((h, idx) => (
                  <div
                    key={h}
                    className="flex-1 text-center text-[10px] text-muted-foreground leading-none"
                  >
                    {/* Mostrar etiqueta en la primera, la última y cada 3 posiciones */}
                    {(idx === 0 || idx === activeHours.length - 1 || idx % 3 === 0)
                      ? String(h).padStart(2, "0")
                      : ""}
                  </div>
                ))}
              </div>

              {/* Filas de días */}
              {DAYS.map((day, dayIdx) => (
                <div key={dayIdx} className="flex items-center mb-0.5">
                  {/* Etiqueta del día */}
                  <div className="w-10 shrink-0 text-[11px] font-medium text-muted-foreground text-right pr-2">
                    {day}
                  </div>

                  {/* Celdas de horas activas */}
                  {activeHours.map(h => {
                    const val = matrix[dayIdx][h];
                    const bg = val !== null && val > 0
                      ? interpolateColor(val, minVal, maxVal)
                      : "var(--muted)";
                    // Texto blanco siempre sobre colores de marca (todos son oscuros)
                    const textColor = val !== null && val > 0 ? "#fff" : "transparent";

                    return (
                      <div
                        key={h}
                        className="flex-1 aspect-square rounded-[2px] mx-[1px] cursor-default transition-opacity hover:opacity-80"
                        style={{ background: bg }}
                        onMouseEnter={e => {
                          if (val !== null) {
                            setTooltip({ day: dayIdx, hour: h, value: val, x: e.clientX, y: e.clientY });
                          }
                        }}
                        onMouseMove={e => {
                          if (val !== null) {
                            setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null);
                          }
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        {/* Valor visible solo en celdas con suficiente espacio */}
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
                <div className="w-10 shrink-0" />
                <div className="flex-1 border-t border-border" />
              </div>

              {/* Fila de totales por hora — solo horas activas */}
              <div className="flex items-center">
                <div className="w-10 shrink-0 text-[10px] text-muted-foreground text-right pr-2">
                  Total
                </div>
                {activeHours.map(h => {
                  const v = hourTotals[h];
                  const pct = v / maxHourTotal;
                  return (
                    <div
                      key={h}
                      className="flex-1 mx-[1px] flex flex-col items-center gap-0.5"
                    >
                      {/* Mini barra */}
                      <div className="w-full rounded-sm overflow-hidden" style={{ height: 16 }}>
                        <div
                          className="w-full rounded-sm"
                          style={{
                            height: `${Math.max(pct * 100, v > 0 ? 8 : 0)}%`,
                            background: "var(--ff-esmeralda)",
                            opacity: 0.7,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Leyenda de escala de color */}
              <div className="flex items-center gap-2 mt-4 justify-end">
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
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
