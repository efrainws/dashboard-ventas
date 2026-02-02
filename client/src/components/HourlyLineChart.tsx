import { useMemo } from "react";
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
import { TrendingUp } from "lucide-react";

export interface HourlySalesDataPoint {
  hour_ts: string;
  sales_amount: string;
  tickets_count: string;
}

interface HourlyLineChartProps {
  data: HourlySalesDataPoint[];
  title?: string;
  description?: string;
}

export function HourlyLineChart({ data, title, description }: HourlyLineChartProps) {
  // Agregar datos por hora del día (0-23)
  const hourlyData = useMemo(() => {
    const grouped = new Map<number, { sales: number; tickets: number }>();

    data.forEach((row) => {
      const date = new Date(row.hour_ts);
      const hour = date.getHours(); // 0-23

      const existing = grouped.get(hour) || { sales: 0, tickets: 0 };
      grouped.set(hour, {
        sales: existing.sales + parseFloat(row.sales_amount || "0"),
        tickets: existing.tickets + parseInt(row.tickets_count || "0"),
      });
    });

    // Crear array de 24 horas (0-23) con datos o ceros
    return Array.from({ length: 24 }, (_, hour) => {
      const values = grouped.get(hour) || { sales: 0, tickets: 0 };
      return {
        hour,
        displayHour: `${String(hour).padStart(2, "0")}:00`,
        sales: values.sales,
        tickets: values.tickets,
      };
    });
  }, [data]);

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
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          {title || "Ventas y Transacciones por Hora"}
        </CardTitle>
        <CardDescription>
          {description || "Patrón de ventas agregado por hora del día (0-23)"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hourlyData.length === 0 ? (
          <div className="flex items-center justify-center h-[400px] text-muted-foreground">
            No hay datos disponibles para mostrar
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={hourlyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="displayHour"
                className="text-xs"
                label={{
                  value: "Hora del Día",
                  position: "insideBottom",
                  offset: -5,
                  style: { textAnchor: "middle" },
                }}
              />
              <YAxis
                yAxisId="left"
                className="text-xs"
                tickFormatter={formatCurrency}
                label={{
                  value: "Ventas (S/)",
                  angle: -90,
                  position: "insideLeft",
                  style: { textAnchor: "middle" },
                }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                className="text-xs"
                tickFormatter={formatNumber}
                label={{
                  value: "Transacciones",
                  angle: 90,
                  position: "insideRight",
                  style: { textAnchor: "middle" },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                }}
                formatter={(value: number, name: string) => {
                  if (name === "sales") {
                    return [formatCurrency(value), "Ventas"];
                  }
                  return [formatNumber(value), "Transacciones"];
                }}
              />
              <Legend
                wrapperStyle={{ paddingTop: "20px" }}
                formatter={(value) => {
                  if (value === "sales") return "Ventas";
                  if (value === "tickets") return "Transacciones";
                  return value;
                }}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="sales"
                stroke="var(--ff-esmeralda)"
                strokeWidth={2}
                dot={{ r: 4, fill: "var(--ff-esmeralda)" }}
                activeDot={{ r: 6, fill: "var(--ff-esmeralda-dark)" }}
                name="sales"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="tickets"
                stroke="var(--ff-cobalto)"
                strokeWidth={2}
                dot={{ r: 4, fill: "var(--ff-cobalto)" }}
                activeDot={{ r: 6, fill: "var(--ff-cobalto-dark)" }}
                name="tickets"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
