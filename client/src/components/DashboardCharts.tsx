import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sale } from "@/hooks/useSalesData";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface DashboardChartsProps {
  sales: Sale[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export function DashboardCharts({ sales }: DashboardChartsProps) {
  // Datos para gráfico de ventas por día
  const salesByDate = useMemo(() => {
    const grouped = sales.reduce((acc, sale) => {
      const date = sale.date_str;
      if (!acc[date]) {
        acc[date] = 0;
      }
      acc[date] += sale.total;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped)
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [sales]);

  // Datos para gráfico de ventas por sucursal
  const salesByBranch = useMemo(() => {
    const grouped = sales.reduce((acc, sale) => {
      const branch = sale.branch_name;
      if (!acc[branch]) {
        acc[branch] = 0;
      }
      acc[branch] += sale.total;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10); // Top 10
  }, [sales]);

  // Datos para gráfico de métodos de pago
  const salesByPaymentMethod = useMemo(() => {
    const grouped: Record<string, number> = {};
    
    sales.forEach(sale => {
      sale.payment_methods.forEach(method => {
        if (!grouped[method]) {
          grouped[method] = 0;
        }
        // Distribuir el total proporcionalmente si hay múltiples métodos
        // (Simplificación: asumimos distribución igualitaria para visualización)
        grouped[method] += sale.total / sale.payment_methods.length;
      });
    });

    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [sales]);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
      {/* Gráfico de Línea: Ventas por Día */}
      <Card className="col-span-4">
        <CardHeader>
          <CardTitle>Ventas por Día</CardTitle>
        </CardHeader>
        <CardContent className="pl-2">
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={salesByDate}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getDate()}/${date.getMonth() + 1}`;
                  }}
                />
                <YAxis
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `$${value.toLocaleString()}`}
                />
                <Tooltip 
                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Ventas']}
                  labelFormatter={(label) => new Date(label).toLocaleDateString()}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Gráfico Circular: Métodos de Pago */}
      <Card className="col-span-3">
        <CardHeader>
          <CardTitle>Métodos de Pago</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={salesByPaymentMethod}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {salesByPaymentMethod.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, 'Monto']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Gráfico de Barras: Ventas por Sucursal */}
      <Card className="col-span-7">
        <CardHeader>
          <CardTitle>Ventas por Sucursal (Top 10)</CardTitle>
        </CardHeader>
        <CardContent className="pl-2">
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesByBranch}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="name"
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `$${value.toLocaleString()}`}
                />
                <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, 'Ventas']} />
                <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
