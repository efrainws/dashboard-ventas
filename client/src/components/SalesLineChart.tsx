import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, TrendingUp } from "lucide-react";

export interface SalesDataPoint {
  hour_ts: string;
  sales_amount: string;
}

interface SalesLineChartProps {
  data: SalesDataPoint[];
  title?: string;
  description?: string;
}

type ViewMode = "day" | "month";

export function SalesLineChart({ data, title, description }: SalesLineChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("day");

  // Agregar datos por día
  const dailyData = useMemo(() => {
    const grouped = new Map<string, { sales: number }>();

    data.forEach((row) => {
      const date = new Date(row.hour_ts);
      const dayKey = date.toISOString().split("T")[0]; // YYYY-MM-DD

      const existing = grouped.get(dayKey) || { sales: 0 };
      grouped.set(dayKey, {
        sales: existing.sales + parseFloat(row.sales_amount || "0"),
      });
    });

    return Array.from(grouped.entries())
      .map(([date, values]) => ({
        date,
        displayDate: new Date(date).toLocaleDateString("es-PE", {
          day: "2-digit",
          month: "short",
        }),
        sales: values.sales,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  // Agregar datos por mes
  const monthlyData = useMemo(() => {
    const grouped = new Map<string, { sales: number }>();

    data.forEach((row) => {
      const date = new Date(row.hour_ts);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; // YYYY-MM

      const existing = grouped.get(monthKey) || { sales: 0 };
      grouped.set(monthKey, {
        sales: existing.sales + parseFloat(row.sales_amount || "0"),
      });
    });

    return Array.from(grouped.entries())
      .map(([month, values]) => ({
        month,
        displayMonth: new Date(month + "-01").toLocaleDateString("es-PE", {
          month: "long",
          year: "numeric",
        }),
        sales: values.sales,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [data]);

  const chartData = viewMode === "day" ? dailyData : monthlyData;
  const xAxisKey = viewMode === "day" ? "displayDate" : "displayMonth";

  // Formatear moneda
  const formatCurrency = (value: number) => {
    return `S/ ${value.toLocaleString("es-PE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  // Formatear número
  const formatNumber = (value: number) => {
    return value.toLocaleString("es-PE");
  };

  return (
    <Card>
      <CardHeader>
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
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey={xAxisKey}
                className="text-xs"
                angle={viewMode === "day" ? -45 : 0}
                textAnchor={viewMode === "day" ? "end" : "middle"}
                height={viewMode === "day" ? 80 : 30}
              />
              <YAxis
                className="text-xs"
                tickFormatter={formatCurrency}
                label={{
                  value: "Ventas (S/)",
                  angle: -90,
                  position: "insideLeft",
                  style: { textAnchor: "middle" },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                }}
                formatter={(value: number) => [formatCurrency(value), "Ventas"]}
              />
              <Line
                type="monotone"
                dataKey="sales"
                stroke="var(--ff-esmeralda)"
                strokeWidth={2}
                dot={{ r: 4, fill: "var(--ff-esmeralda)" }}
                activeDot={{ r: 6, fill: "var(--ff-esmeralda-dark)" }}
                name="sales"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
