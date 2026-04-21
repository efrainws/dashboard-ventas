import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, TrendingDown } from "lucide-react";

export interface SalesDataPoint {
  branch_id: string;
  branch_name: string;
  branch_sap_id: string;
  sales_amount: string;
  tickets_count?: string;
  doc_date?: string;
  sale_ids?: string[]; // Array de sale_ids únicos para conteo correcto
}

interface BranchComparison {
  branch_id: string;
  branch_name: string;
  branch_sap_id: string;
  current: { total_sales: number; total_tickets: number; avg_ticket: number; avg_sales_per_day: number };
  previous: { total_sales: number; total_tickets: number; avg_ticket: number; avg_sales_per_day: number };
}

interface BranchBarChartProps {
  data: SalesDataPoint[];
  comparisonData?: BranchComparison[];
  title?: string;
  description?: string;
  /** Número de días del mes para calcular la proyección mensual */
  daysInMonth?: number;
}

// Colores para las barras (paleta ampliada Flora y Fauna)
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
];

export function BranchBarChart({ data, comparisonData, title, description, daysInMonth }: BranchBarChartProps) {
  // Calcular días del mes actual si no se pasa como prop
  const resolvedDaysInMonth = daysInMonth ?? (() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  })();
  // Agregar ventas por sucursal y calcular días únicos globales
  const branchData = useMemo(() => {
    const grouped = new Map<
      string,
      { name: string; sapId: string; sales: number; saleIds: Set<string> }
    >();
    
    // Calcular días únicos globales (no por sucursal)
    const globalDates = new Set<string>();

    data.forEach((row) => {
      const branchId = row.branch_id;
      const branchName = row.branch_name || "Sin Nombre";
      const sapId = row.branch_sap_id || "";
      const docDate = row.doc_date;

      // Agregar fecha al conjunto global (convertir a string con offset UTC-5)
      if (docDate) {
        const date = new Date(docDate);
        const utcMinus5 = new Date(date.getTime() - 5 * 60 * 60 * 1000);
        const dateStr = utcMinus5.toISOString().split('T')[0];
        globalDates.add(dateStr);
      }

      const existing = grouped.get(branchId) || {
        name: branchName,
        sapId: sapId,
        sales: 0,
        saleIds: new Set<string>(),
      };
      
      // Agregar sale_ids únicos al Set
      if (row.sale_ids) {
        row.sale_ids.forEach(saleId => existing.saleIds.add(saleId));
      }
      
      grouped.set(branchId, {
        name: branchName,
        sapId: sapId,
        sales: existing.sales + parseFloat(row.sales_amount || "0"),
        saleIds: existing.saleIds,
      });
    });

    // Cantidad de días únicos en el análisis completo
    const globalDaysCount = globalDates.size;

    // Convertir a array y ordenar por ventas (mayor a menor)
    const result = Array.from(grouped.values())
      .sort((a, b) => b.sales - a.sales)
      .map((item) => {
        const tickets = item.saleIds.size; // Contar sale_ids únicos
        const avgTicket = tickets > 0 ? item.sales / tickets : 0;
        const avgSalesPerDay = globalDaysCount > 0 ? item.sales / globalDaysCount : 0;
        
        return {
          name: item.name,
          sapId: item.sapId,
          displayName: `${item.name} (${item.sapId})`,
          sales: item.sales,
          tickets: tickets,
          avgTicket,
          avgSalesPerDay,
          globalDaysCount,
        };
      });

    return result;
  }, [data]);

  // Formatear moneda
  const formatCurrency = (value: number) => {
    return `S/ ${value.toLocaleString("es-PE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  // Formatear moneda abreviada para eje Y (800,000 → 800k)
  const formatCurrencyShort = (value: number) => {
    if (value >= 1000000) {
      return `S/ ${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `S/ ${(value / 1000).toFixed(0)}k`;
    }
    return `S/ ${value}`;
  };

  // Formatear número
  const formatNumber = (value: number) => {
    return value.toLocaleString("es-PE");
  };

  // Custom label para las barras (mostrar valor encima)
  const renderCustomLabel = (props: any) => {
    const { x, y, width, value } = props;
    return (
      <text
        x={x + width / 2}
        y={y - 5}
        fill="hsl(var(--foreground))"
        textAnchor="middle"
        className="text-xs font-medium"
      >
        {formatCurrency(value)}
      </text>
    );
  };

  return (
    <Card className="overflow-hidden" style={{ border: "1px solid #EAE8E2" }}>
      <CardHeader className="pb-3 rounded-t-lg" style={{ borderBottom: "1px solid #EAE8E2", background: "#F5F4F1" }}>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          {title || "Comparación por Sucursal"}
        </CardTitle>
        <CardDescription style={{ fontFamily: "'Sailec', sans-serif", color: "#919291" }}>
          {description || "Ventas totales por sucursal ordenadas de mayor a menor"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {branchData.length === 0 ? (
          <div className="flex items-center justify-center h-[400px] text-muted-foreground">
            No hay datos disponibles para mostrar
          </div>
        ) : (
          <div className="space-y-4">
            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                data={branchData}
                margin={{ top: 5, right: 10, left: 10, bottom: 100 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="displayName"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  className="text-xs"
                  interval={0}
                />
                <YAxis
                  className="text-xs"
                  tickFormatter={formatCurrencyShort}
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
                    return [value, name];
                  }}
                  labelFormatter={(label) => label}
                />

                <Bar dataKey="sales" name="sales" radius={[8, 8, 0, 0]}>
                  {branchData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Tabla de resumen */}
            <div>
              <table className="ff-table">
                <thead>
                  <tr>
                    <th>Sucursal</th>
                    <th>Ventas</th>
                    <th>Transacciones</th>
                    <th>Ticket Promedio</th>
                    <th>Venta Prom. Diaria</th>
                    <th>Proyección Mensual</th>
                  </tr>
                </thead>
                <tbody>
                  {branchData.map((item, index) => (
                    <tr key={index}>
                      <td className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        {item.displayName}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          {formatCurrency(item.sales)}
                          {comparisonData && (() => {
                            const comparison = comparisonData.find(c => c.branch_sap_id === item.sapId);
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
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          {formatNumber(item.tickets)}
                          {comparisonData && (() => {
                            const comparison = comparisonData.find(c => c.branch_sap_id === item.sapId);
                            if (comparison && comparison.previous.total_tickets > 0) {
                              const change = ((comparison.current.total_tickets - comparison.previous.total_tickets) / comparison.previous.total_tickets) * 100;
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
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          {formatCurrency(item.avgTicket)}
                          {comparisonData && (() => {
                            const comparison = comparisonData.find(c => c.branch_sap_id === item.sapId);
                            if (comparison && comparison.previous.avg_ticket > 0) {
                              const change = ((comparison.current.avg_ticket - comparison.previous.avg_ticket) / comparison.previous.avg_ticket) * 100;
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
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          {formatCurrency(item.avgSalesPerDay)}
                          {comparisonData && (() => {
                            const comparison = comparisonData.find(c => c.branch_sap_id === item.sapId);
                            if (comparison && comparison.previous.avg_sales_per_day > 0) {
                              const change = ((comparison.current.avg_sales_per_day - comparison.previous.avg_sales_per_day) / comparison.previous.avg_sales_per_day) * 100;
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
                      {/* Proyección mensual = promedio diario × días del mes */}
                      <td>
                        {formatCurrency(item.avgSalesPerDay * resolvedDaysInMonth)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td>
                      {formatCurrency(
                        branchData.reduce((sum, item) => sum + item.sales, 0)
                      )}
                    </td>
                    <td>
                      {/* Contar tickets únicos globales */}
                      {formatNumber(
                        (() => {
                          const allSaleIds = new Set<string>();
                          data.forEach(row => {
                            if (row.sale_ids) {
                              row.sale_ids.forEach(saleId => allSaleIds.add(saleId));
                            }
                          });
                          return allSaleIds.size;
                        })()
                      )}
                    </td>
                    <td>
                      {formatCurrency(
                        (() => {
                          const totalSales = branchData.reduce((sum, item) => sum + item.sales, 0);
                          const allSaleIds = new Set<string>();
                          data.forEach(row => {
                            if (row.sale_ids) {
                              row.sale_ids.forEach(saleId => allSaleIds.add(saleId));
                            }
                          });
                          return totalSales / allSaleIds.size;
                        })()
                      )}
                    </td>
                    <td>
                      {formatCurrency(
                        branchData.length > 0
                          ? branchData.reduce((sum, item) => sum + item.sales, 0) / branchData[0].globalDaysCount
                          : 0
                      )}
                    </td>
                    {/* Total proyección mensual */}
                    <td>
                      {formatCurrency(
                        branchData.length > 0
                          ? (branchData.reduce((sum, item) => sum + item.sales, 0) / branchData[0].globalDaysCount) * resolvedDaysInMonth
                          : 0
                      )}
                    </td>
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
