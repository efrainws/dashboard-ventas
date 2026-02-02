import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChartIcon } from "lucide-react";

export interface SalesDataPoint {
  category_abuelo_id: string;
  category_abuelo_name: string;
  sales_amount: string;
}

interface CategoryPieChartProps {
  data: SalesDataPoint[];
  title?: string;
  description?: string;
}

// Colores para las categorías (paleta ampliada Flora y Fauna)
const COLORS = [
  "var(--ff-esmeralda)",       // Esmeralda
  "var(--ff-cobalto)",         // Cobalto
  "var(--ff-celeste)",         // Celeste
  "var(--ff-mostaza)",         // Mostaza
  "var(--ff-rosado)",          // Rosado
  "var(--ff-granate)",         // Granate
  "var(--ff-esmeralda-light)", // Esmeralda claro
  "var(--ff-cobalto-light)",   // Cobalto claro
  "var(--ff-celeste-light)",   // Celeste claro
  "var(--ff-mostaza-light)",   // Mostaza claro
  "var(--ff-rosado-light)",    // Rosado claro
  "var(--ff-granate-light)",   // Granate claro
  "var(--ff-esmeralda-dark)",  // Esmeralda oscuro
  "var(--ff-cobalto-dark)",    // Cobalto oscuro
  "var(--ff-celeste-dark)",    // Celeste oscuro
];

export function CategoryPieChart({ data, title, description }: CategoryPieChartProps) {
  // Agregar ventas por categoría
  const categoryData = useMemo(() => {
    const grouped = new Map<string, { name: string; sales: number }>();

    data.forEach((row) => {
      const categoryId = row.category_abuelo_id;
      const categoryName = row.category_abuelo_name || "Sin Categoría";

      const existing = grouped.get(categoryId) || { name: categoryName, sales: 0 };
      grouped.set(categoryId, {
        name: categoryName,
        sales: existing.sales + parseFloat(row.sales_amount || "0"),
      });
    });

    // Convertir a array y ordenar por ventas (mayor a menor)
    const result = Array.from(grouped.values())
      .sort((a, b) => b.sales - a.sales)
      .map((item) => ({
        name: item.name,
        value: item.sales,
      }));

    return result;
  }, [data]);

  // Calcular total para porcentajes
  const total = useMemo(() => {
    return categoryData.reduce((sum, item) => sum + item.value, 0);
  }, [categoryData]);

  // Formatear moneda
  const formatCurrency = (value: number) => {
    return `S/ ${value.toLocaleString("es-PE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  // Formatear porcentaje
  const formatPercentage = (value: number) => {
    const percentage = (value / total) * 100;
    return `${percentage.toFixed(1)}%`;
  };

  // Custom label para el gráfico
  const renderCustomLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent,
  }: any) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * (Math.PI / 180));
    const y = cy + radius * Math.sin(-midAngle * (Math.PI / 180));

    // Solo mostrar porcentaje si es mayor al 3%
    if (percent < 0.03) return null;

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
        className="text-xs font-semibold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PieChartIcon className="h-5 w-5" />
          {title || "Distribución por Categoría"}
        </CardTitle>
        <CardDescription>
          {description || "Ventas totales distribuidas por categoría abuelo"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {categoryData.length === 0 ? (
          <div className="flex items-center justify-center h-[400px] text-muted-foreground">
            No hay datos disponibles para mostrar
          </div>
        ) : (
          <div className="space-y-4">
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={120}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                  }}
                  formatter={(value: number, name: string) => {
                    return [
                      `${formatCurrency(value)} (${formatPercentage(value)})`,
                      name,
                    ];
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value, entry: any) => {
                    const percentage = formatPercentage(entry.payload.value);
                    return `${value} (${percentage})`;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Tabla de resumen */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2 font-medium">Categoría</th>
                    <th className="text-right p-2 font-medium">Ventas</th>
                    <th className="text-right p-2 font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryData.map((item, index) => (
                    <tr key={index} className="border-t">
                      <td className="p-2 flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        {item.name}
                      </td>
                      <td className="text-right p-2">{formatCurrency(item.value)}</td>
                      <td className="text-right p-2 font-medium">
                        {formatPercentage(item.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted font-semibold">
                  <tr>
                    <td className="p-2">Total</td>
                    <td className="text-right p-2">{formatCurrency(total)}</td>
                    <td className="text-right p-2">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
