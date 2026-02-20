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
import { BarChart3 } from "lucide-react";

export interface SalesDataPoint {
  branch_id: string;
  branch_name: string;
  branch_sap_id: string;
  sales_amount: string;
  tickets_count?: string;
  doc_date?: string;
}

interface BranchBarChartProps {
  data: SalesDataPoint[];
  title?: string;
  description?: string;
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

export function BranchBarChart({ data, title, description }: BranchBarChartProps) {
  // Agregar ventas por sucursal y calcular días únicos globales
  const branchData = useMemo(() => {
    const grouped = new Map<
      string,
      { name: string; sapId: string; sales: number; tickets: number }
    >();
    
    // Calcular días únicos globales (no por sucursal)
    const globalDates = new Set<string>();

    data.forEach((row) => {
      const branchId = row.branch_id;
      const branchName = row.branch_name || "Sin Nombre";
      const sapId = row.branch_sap_id || "";
      const docDate = row.doc_date;

      // Agregar fecha al conjunto global (convertir a string)
      if (docDate) {
        const dateStr = String(docDate).split('T')[0];
        globalDates.add(dateStr);
      }

      const existing = grouped.get(branchId) || {
        name: branchName,
        sapId: sapId,
        sales: 0,
        tickets: 0,
      };
      
      grouped.set(branchId, {
        name: branchName,
        sapId: sapId,
        sales: existing.sales + parseFloat(row.sales_amount || "0"),
        tickets: existing.tickets + parseInt(row.tickets_count || "0", 10),
      });
    });

    // Cantidad de días únicos en el análisis completo
    const globalDaysCount = globalDates.size;

    // Convertir a array y ordenar por ventas (mayor a menor)
    const result = Array.from(grouped.values())
      .sort((a, b) => b.sales - a.sales)
      .map((item) => {
        const avgTicket = item.tickets > 0 ? item.sales / item.tickets : 0;
        const avgSalesPerDay = globalDaysCount > 0 ? item.sales / globalDaysCount : 0;
        
        return {
          name: item.name,
          sapId: item.sapId,
          displayName: `${item.name} (${item.sapId})`,
          sales: item.sales,
          tickets: item.tickets,
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          {title || "Comparación por Sucursal"}
        </CardTitle>
        <CardDescription>
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
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2 font-medium">Sucursal</th>
                    <th className="text-right p-2 font-medium">Ventas</th>
                    <th className="text-right p-2 font-medium">Transacciones</th>
                    <th className="text-right p-2 font-medium">Ticket Promedio</th>
                    <th className="text-right p-2 font-medium">Venta Prom. Diaria</th>
                  </tr>
                </thead>
                <tbody>
                  {branchData.map((item, index) => (
                    <tr key={index} className="border-t">
                      <td className="p-2 flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        {item.displayName}
                      </td>
                      <td className="text-right p-2">{formatCurrency(item.sales)}</td>
                      <td className="text-right p-2">{formatNumber(item.tickets)}</td>
                      <td className="text-right p-2">{formatCurrency(item.avgTicket)}</td>
                      <td className="text-right p-2">{formatCurrency(item.avgSalesPerDay)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted font-semibold">
                  <tr>
                    <td className="p-2">Total</td>
                    <td className="text-right p-2">
                      {formatCurrency(
                        branchData.reduce((sum, item) => sum + item.sales, 0)
                      )}
                    </td>
                    <td className="text-right p-2">
                      {formatNumber(
                        branchData.reduce((sum, item) => sum + item.tickets, 0)
                      )}
                    </td>
                    <td className="text-right p-2">
                      {formatCurrency(
                        branchData.reduce((sum, item) => sum + item.sales, 0) /
                        branchData.reduce((sum, item) => sum + item.tickets, 0)
                      )}
                    </td>
                    <td className="text-right p-2">
                      {formatCurrency(
                        branchData.length > 0
                          ? branchData.reduce((sum, item) => sum + item.sales, 0) / branchData[0].globalDaysCount
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
