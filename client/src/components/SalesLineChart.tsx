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
  doc_date: string;
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
      // Convertir doc_date a Date si es string, o usarlo directamente si ya es Date
      const docDate = typeof row.doc_date === 'string' ? new Date(row.doc_date) : row.doc_date;
      // Extraer fecha en formato YYYY-MM-DD usando UTC
      const year = docDate.getUTCFullYear();
      const month = String(docDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(docDate.getUTCDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;

      const existing = grouped.get(dateKey) || { sales: 0 };
      grouped.set(dateKey, {
        sales: existing.sales + parseFloat(row.sales_amount || "0"),
      });
    });

    return Array.from(grouped.entries())
      .map(([date, values]) => {
        // Formatear fecha manualmente para evitar problemas de zona horaria
        const [year, month, day] = date.split("-");
        const monthNames = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
        const displayDate = `${day} ${monthNames[parseInt(month) - 1]}`;
        return {
          date,
          displayDate,
          sales: values.sales,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  // Agregar datos por mes
  const monthlyData = useMemo(() => {
    const grouped = new Map<string, { sales: number }>();

    data.forEach((row) => {
      // Convertir doc_date a Date si es string
      const docDate = typeof row.doc_date === 'string' ? new Date(row.doc_date) : row.doc_date;
      // Extraer año-mes usando UTC
      const year = docDate.getUTCFullYear();
      const month = String(docDate.getUTCMonth() + 1).padStart(2, '0');
      const monthKey = `${year}-${month}`; // YYYY-MM

      const existing = grouped.get(monthKey) || { sales: 0 };
      grouped.set(monthKey, {
        sales: existing.sales + parseFloat(row.sales_amount || "0"),
      });
    });

    return Array.from(grouped.entries())
      .map(([month, values]) => {
        // Formatear mes manualmente
        const [year, monthNum] = month.split("-");
        const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
        const displayMonth = `${monthNames[parseInt(monthNum) - 1]} ${year}`;
        return {
          month,
          displayMonth,
          sales: values.sales,
        };
      })
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
    <Card className="overflow-hidden" style={{ border: "1px solid #EAE8E2" }}>
      <CardHeader className="pb-3 rounded-t-lg" style={{ borderBottom: "1px solid #EAE8E2", background: "#F5F4F1" }}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {title || "Progresión de Ventas"}
            </CardTitle>
            <CardDescription style={{ fontFamily: "'Sailec', sans-serif", color: "#919291" }}>
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
              <YAxis
                className="text-xs"
                tickFormatter={formatCurrency}
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
                stroke="#008064"
                strokeWidth={2}
                dot={{ r: 4, fill: "#008064" }}
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
