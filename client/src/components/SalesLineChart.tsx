import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, TrendingUp, TrendingDown, Minus } from "lucide-react";

export interface SalesDataPoint {
  doc_date: string;
  sales_amount: string;
}

interface SalesLineChartProps {
  data: SalesDataPoint[];
  comparisonData?: SalesDataPoint[];
  title?: string;
  description?: string;
}

type ViewMode = "day" | "month";

// ─── Tooltip personalizado ─────────────────────────────────────────────────────
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; dataKey?: string; payload: { prevSales?: number; comparisonSales?: number; label: string } }>;
  label?: string;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const currentEntry = payload.find(entry => entry.dataKey === "sales") ?? payload[0];
  const current = currentEntry.value;
  const comparison = currentEntry.payload.comparisonSales;
  const prev = comparison ?? currentEntry.payload.prevSales;
  const periodLabel = currentEntry.payload.label;

  const formatCurrency = (v: number) =>
    `S/ ${v.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  let variationEl: React.ReactNode = null;
  if (prev !== undefined && prev > 0) {
    const pct = ((current - prev) / prev) * 100;
    const isPos = pct > 0;
    const isNeutral = Math.abs(pct) < 0.05;
    const color = isNeutral ? "hsl(var(--muted-foreground))" : isPos ? "#008064" : "#BC2C46";
    const Icon = isNeutral ? Minus : isPos ? TrendingUp : TrendingDown;
    const sign = isPos ? "+" : "";
    variationEl = (
      <div className="flex items-center gap-1 mt-1 text-xs font-medium" style={{ color }}>
        <Icon className="h-3 w-3" />
        <span>{sign}{pct.toFixed(1)}% vs {comparison !== undefined ? "comparativo" : "anterior"} ({formatCurrency(prev)})</span>
      </div>
    );
  } else if (prev === 0) {
    variationEl = (
      <div className="text-xs text-muted-foreground mt-1">Sin datos en período anterior</div>
    );
  }

  return (
    <div
      className="rounded-md border px-3 py-2 text-sm shadow-md"
      style={{
        backgroundColor: "hsl(var(--background))",
        border: "1px solid hsl(var(--border))",
        minWidth: 180,
      }}
    >
      <p className="font-semibold text-foreground mb-1">{periodLabel}</p>
      <p className="text-foreground">
        <span className="text-muted-foreground">Ventas: </span>
        {formatCurrency(current)}
      </p>
      {variationEl}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────
export function SalesLineChart({ data, comparisonData = [], title, description }: SalesLineChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("day");

  // Agregar datos por día con variación vs punto anterior
  const dailyData = useMemo(() => {
    const grouped = new Map<string, { sales: number }>();

    data.forEach((row) => {
      const docDate = typeof row.doc_date === "string" ? new Date(row.doc_date) : row.doc_date;
      const year = docDate.getUTCFullYear();
      const month = String(docDate.getUTCMonth() + 1).padStart(2, "0");
      const day = String(docDate.getUTCDate()).padStart(2, "0");
      const dateKey = `${year}-${month}-${day}`;

      const existing = grouped.get(dateKey) || { sales: 0 };
      grouped.set(dateKey, {
        sales: existing.sales + parseFloat(row.sales_amount || "0"),
      });
    });

    const monthNames = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const sorted = Array.from(grouped.entries())
      .map(([date, values]) => {
        const [year, month, day] = date.split("-");
        const displayDate = `${day} ${monthNames[parseInt(month) - 1]}`;
        return { date, label: displayDate, sales: values.sales };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    // Agregar variación vs punto anterior
    return sorted.map((item, idx) => ({
      ...item,
      prevSales: idx > 0 ? sorted[idx - 1].sales : undefined,
    }));
  }, [data]);

  // Agregar datos por mes con variación vs punto anterior
  const monthlyData = useMemo(() => {
    const grouped = new Map<string, { sales: number }>();

    data.forEach((row) => {
      const docDate = typeof row.doc_date === "string" ? new Date(row.doc_date) : row.doc_date;
      const year = docDate.getUTCFullYear();
      const month = String(docDate.getUTCMonth() + 1).padStart(2, "0");
      const monthKey = `${year}-${month}`;

      const existing = grouped.get(monthKey) || { sales: 0 };
      grouped.set(monthKey, {
        sales: existing.sales + parseFloat(row.sales_amount || "0"),
      });
    });

    const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const sorted = Array.from(grouped.entries())
      .map(([month, values]) => {
        const [year, monthNum] = month.split("-");
        const displayMonth = `${monthNames[parseInt(monthNum) - 1]} ${year}`;
        return { month, label: displayMonth, sales: values.sales };
      })
      .sort((a, b) => a.month.localeCompare(b.month));

    return sorted.map((item, idx) => ({
      ...item,
      prevSales: idx > 0 ? sorted[idx - 1].sales : undefined,
    }));
  }, [data]);

  const comparisonDailyData = useMemo(() => {
    const grouped = new Map<string, number>();
    comparisonData.forEach(row => {
      const date = new Date(row.doc_date);
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
      grouped.set(key, (grouped.get(key) ?? 0) + parseFloat(row.sales_amount || "0"));
    });
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, sales]) => sales);
  }, [comparisonData]);

  const comparisonMonthlyData = useMemo(() => {
    const grouped = new Map<string, number>();
    comparisonData.forEach(row => {
      const date = new Date(row.doc_date);
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      grouped.set(key, (grouped.get(key) ?? 0) + parseFloat(row.sales_amount || "0"));
    });
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, sales]) => sales);
  }, [comparisonData]);

  const chartData = useMemo(() => {
    const primary = viewMode === "day" ? dailyData : monthlyData;
    const comparison = viewMode === "day" ? comparisonDailyData : comparisonMonthlyData;
    return primary.map((row, index) => ({ ...row, comparisonSales: comparison[index] }));
  }, [viewMode, dailyData, monthlyData, comparisonDailyData, comparisonMonthlyData]);
  const xAxisKey = "label";

  const formatCurrencyShort = (value: number) => {
    if (value >= 1_000_000) return `S/ ${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `S/ ${(value / 1_000).toFixed(0)}k`;
    return `S/ ${value}`;
  };

  return (
    <Card className="overflow-hidden" style={{ border: "1px solid var(--ff-card-header-border)" }}>
      <CardHeader
        className="pb-3 rounded-t-lg"
        style={{ borderBottom: "1px solid var(--ff-card-header-border)", background: "var(--ff-card-header-bg)" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {title || "Progresión de Ventas"}
            </CardTitle>
            <CardDescription>
              {description || `Ventas agregadas por ${viewMode === "day" ? "día" : "mes"}`}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant={viewMode === "day" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("day")}
            >
              <Calendar className="mr-2 h-4 w-4" />
              Por Día
            </Button>
            <Button
              variant={viewMode === "month" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("month")}
            >
              <Calendar className="mr-2 h-4 w-4" />
              Por Mes
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-[400px] text-muted-foreground">
            No hay datos disponibles para mostrar
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 80 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey={xAxisKey}
                className="text-xs"
                angle={viewMode === "day" ? -45 : 0}
                textAnchor={viewMode === "day" ? "end" : "middle"}
                height={100}
                interval={viewMode === "day" ? "preserveStartEnd" : 0}
              />
              <YAxis className="text-xs" tickFormatter={formatCurrencyShort} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="sales"
                stroke="#008064"
                strokeWidth={2}
                dot={{ r: 4, fill: "#008064" }}
                activeDot={{ r: 6, fill: "var(--ff-esmeralda-dark)" }}
                name="sales"
              />
              {comparisonData.length > 0 && (
                <Line
                  type="monotone"
                  dataKey="comparisonSales"
                  stroke="var(--ff-cobalto)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  activeDot={{ r: 5 }}
                  name="comparativo"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
