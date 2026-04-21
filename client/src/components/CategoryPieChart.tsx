import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChartIcon, TrendingUp, TrendingDown } from "lucide-react";

export interface SalesDataPoint {
  category_abuelo_id: string;
  category_abuelo_name: string;
  sales_amount: string;
}

interface CategoryComparison {
  category_id: string;
  category_name: string;
  current: { total_sales: number };
  previous: { total_sales: number };
}

interface CategoryPieChartProps {
  data: SalesDataPoint[];
  comparisonData?: CategoryComparison[];
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

export function CategoryPieChart({ data, comparisonData, title, description }: CategoryPieChartProps) {
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
    <Card className="overflow-hidden" style={{ border: "1px solid #EAE8E2" }}>
      <CardHeader className="pb-3 rounded-t-lg" style={{ borderBottom: "1px solid #EAE8E2", background: "#F5F4F1" }}>
        <CardTitle className="flex items-center gap-2">
          <PieChartIcon className="h-5 w-5" />
          {title || "Distribución por Categoría"}
        </CardTitle>
        <CardDescription style={{ fontFamily: "'Sailec', sans-serif", color: "#919291" }}>
          {description || "Ventas totales distribuidas por departamento"}
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
              <PieChart margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={140}
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
                      <td className="text-right p-2">
                        <div className="flex items-center justify-end gap-1">
                          {formatCurrency(item.value)}
                          {comparisonData && (() => {
                            const comparison = comparisonData.find(c => c.category_name === item.name);
                            if (comparison && comparison.previous.total_sales > 0) {
                              const change = ((comparison.current.total_sales - comparison.previous.total_sales) / comparison.previous.total_sales) * 100;
                              if (Math.abs(change) >= 0.1) {
                                return change > 0 ? (
                                  <TrendingUp className="h-3 w-3" style={{ color: '#008064' }} />
                                ) : (
                                  <TrendingDown className="h-3 w-3" style={{ color: '#BC2C46' }} />
                                );
                              }
                            }
                            return null;
                          })()}
                        </div>
                      </td>
                      <td className="text-right p-2 font-medium">
                        <div className="flex items-center justify-end gap-1">
                          {formatPercentage(item.value)}
                          {comparisonData && (() => {
                            const comparison = comparisonData.find(c => c.category_name === item.name);
                            if (comparison && comparison.previous.total_sales > 0 && comparison.current.total_sales > 0) {
                              // Calcular porcentaje del período actual y anterior
                              const totalCurrent = comparisonData.reduce((sum, c) => sum + c.current.total_sales, 0);
                              const totalPrevious = comparisonData.reduce((sum, c) => sum + c.previous.total_sales, 0);
                              const currentPercent = (comparison.current.total_sales / totalCurrent) * 100;
                              const previousPercent = (comparison.previous.total_sales / totalPrevious) * 100;
                              const change = currentPercent - previousPercent;
                              
                              if (Math.abs(change) >= 0.1) {
                                return change > 0 ? (
                                  <TrendingUp className="h-3 w-3" style={{ color: '#008064' }} />
                                ) : (
                                  <TrendingDown className="h-3 w-3" style={{ color: '#BC2C46' }} />
                                );
                              }
                            }
                            return null;
                          })()}
                        </div>
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
