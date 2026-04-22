import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// ── Colores por canal — usando variables CSS ──────────────────────────────────
// Los colores de canal están definidos en index.css como --ff-canal-*
const CHANNEL_CSS_COLOR: Record<string, string> = {
  "Presencial": "var(--ff-canal-presencial)",
  "eCommerce":  "var(--ff-canal-ecommerce)",
  "Rappi":      "var(--ff-canal-rappi)",
};

const CHANNEL_CSS_LIGHT: Record<string, string> = {
  "Presencial": "var(--ff-canal-presencial-light)",
  "eCommerce":  "var(--ff-canal-ecommerce-light)",
  "Rappi":      "var(--ff-canal-rappi-light)",
};

const CHANNEL_CSS_BORDER: Record<string, string> = {
  "Presencial": "var(--ff-canal-presencial-border)",
  "eCommerce":  "var(--ff-canal-ecommerce-border)",
  "Rappi":      "var(--ff-canal-rappi-border)",
};

// Colores resueltos para Recharts (que no soporta var() CSS)
const CHANNEL_RECHARTS: Record<string, string> = {
  "Presencial": "#1A6894",
  "eCommerce":  "#C49705",
  "Rappi":      "#008064",
};

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface SalesRow {
  sales_channel: string;
  sales_amount: string;
  sale_ids?: string[];
  sale_date?: string;
}

interface ChannelBreakdownProps {
  data: SalesRow[];
  numberOfDays: number;
  daysInMonth: number;
  isLoading?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatCurrency = (n: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

const formatNumber = (n: number) =>
  new Intl.NumberFormat("es-PE").format(n);

// Tooltip personalizado para el gráfico de pie
const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div
      className="rounded-lg px-3 py-2 text-sm shadow-md"
      style={{
        background: "var(--card)",
        border: "1px solid var(--ff-table-border)",
        color: "var(--ff-carbon)",
      }}
    >
      <p className="font-semibold" style={{ color: entry.payload.fill }}>
        {entry.name}
      </p>
      <p>
        {formatCurrency(entry.value)}{" "}
        <span style={{ color: "var(--ff-humo)" }}>
          ({entry.payload.pct.toFixed(1)}%)
        </span>
      </p>
    </div>
  );
};

// Label personalizado para el pie
const renderCustomLabel = ({
  cx, cy, midAngle, innerRadius, outerRadius, pct,
}: any) => {
  if (pct < 5) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      style={{ fontSize: 12, fontWeight: 600 }}
    >
      {pct.toFixed(1)}%
    </text>
  );
};

// ── Componente principal ──────────────────────────────────────────────────────
export function ChannelBreakdown({
  data,
  numberOfDays,
  daysInMonth,
  isLoading,
}: ChannelBreakdownProps) {
  // Calcular métricas por canal
  const channelStats = useMemo(() => {
    if (!data || data.length === 0) return [];

    const map = new Map<string, { sales: number; saleIds: Set<string> }>();

    data.forEach((row) => {
      const ch = row.sales_channel || "Desconocido";
      if (!map.has(ch)) {
        map.set(ch, { sales: 0, saleIds: new Set() });
      }
      const entry = map.get(ch)!;
      entry.sales += parseFloat(row.sales_amount || "0");
      if (Array.isArray(row.sale_ids)) {
        row.sale_ids.forEach((id) => entry.saleIds.add(id));
      }
    });

    const totalSales = Array.from(map.values()).reduce((s, v) => s + v.sales, 0);

    return Array.from(map.entries())
      .map(([channel, { sales, saleIds }]) => {
        const transactions = saleIds.size;
        const avgTicket = transactions > 0 ? sales / transactions : 0;
        const avgDaily = numberOfDays > 0 ? sales / numberOfDays : 0;
        const projection = avgDaily * daysInMonth;
        const pct = totalSales > 0 ? (sales / totalSales) * 100 : 0;
        return { channel, sales, transactions, avgTicket, avgDaily, projection, pct };
      })
      .sort((a, b) => b.sales - a.sales);
  }, [data, numberOfDays, daysInMonth]);

  // Datos para el pie chart
  const pieData = useMemo(
    () =>
      channelStats.map((s) => ({
        name: s.channel,
        value: s.sales,
        pct: s.pct,
        fill: CHANNEL_RECHARTS[s.channel] ?? "#BC2C46",
      })),
    [channelStats]
  );

  if (isLoading) {
    return (
      <Card style={{ border: "1px solid var(--ff-card-header-border)" }}>
        <CardContent className="py-12 flex items-center justify-center">
          <div
            className="h-6 w-6 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--ff-canal-presencial)", borderTopColor: "transparent" }}
          />
          <span className="ml-2 text-sm text-muted-foreground">
            Calculando métricas por canal...
          </span>
        </CardContent>
      </Card>
    );
  }

  if (channelStats.length === 0) {
    return (
      <Card style={{ border: "1px solid var(--ff-card-header-border)" }}>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No hay datos disponibles para el período seleccionado.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden" style={{ border: "1px solid var(--ff-card-header-border)" }}>
      <CardHeader
        className="pb-3 rounded-t-lg"
        style={{ borderBottom: "1px solid var(--ff-card-header-border)", background: "var(--ff-card-header-bg)" }}
      >
        <CardTitle className="flex items-center gap-2">
          Análisis por Canal de Venta
        </CardTitle>
        <CardDescription>
          Distribución de ventas, transacciones y métricas clave según el canal de venta
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* ── Gráfico de pie ── */}
          <div>
            <p className="ff-section-label mb-4">
              Participación en Ventas
            </p>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  innerRadius={50}
                  dataKey="value"
                  labelLine={false}
                  label={renderCustomLabel}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} stroke="var(--card)" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span style={{ fontSize: 13 }}>
                      {value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* ── Tabla de métricas ── */}
          <div>
            <p className="ff-section-label mb-4">
              Métricas Detalladas
            </p>

            {/* Tabla canónica ff-table */}
            <table className="ff-table">
              <thead>
                <tr>
                  <th>Canal</th>
                  <th>Ventas</th>
                  <th>Transac.</th>
                  <th>Tkt. Prom.</th>
                  <th>Prom. Día</th>
                </tr>
              </thead>
              <tbody>
                {channelStats.map((row) => {
                  const color = CHANNEL_CSS_COLOR[row.channel] ?? "var(--ff-granate)";
                  const lightColor = CHANNEL_CSS_LIGHT[row.channel] ?? "var(--ff-hueso)";
                  const borderColor = CHANNEL_CSS_BORDER[row.channel] ?? "var(--ff-beige)";
                  return (
                    <tr key={row.channel}>
                      <td>
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
                          style={{
                            background: lightColor,
                            color: color,
                            border: `1px solid ${borderColor}`,
                          }}
                        >
                          {row.channel}
                        </span>
                      </td>
                      <td>{formatCurrency(row.sales)}</td>
                      <td>{formatNumber(row.transactions)}</td>
                      <td>{formatCurrency(row.avgTicket)}</td>
                      <td>{formatCurrency(row.avgDaily)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Fila de proyección mensual */}
            <div
              className="mt-3 rounded-lg p-3"
              style={{
                background: "var(--ff-table-head-bg)",
                border: "1px solid var(--ff-table-border)",
              }}
            >
              <p className="ff-section-label mb-2">
                Proyección Mensual ({daysInMonth} días)
              </p>
              <div className="space-y-1.5">
                {channelStats.map((row) => {
                  const color = CHANNEL_RECHARTS[row.channel] ?? "#BC2C46";
                  const totalProjection = channelStats.reduce((s, r) => s + r.projection, 0);
                  const barPct = totalProjection > 0 ? (row.projection / totalProjection) * 100 : 0;
                  return (
                    <div key={row.channel} className="flex items-center gap-2">
                      <span className="text-xs w-20 flex-shrink-0 text-muted-foreground">
                        {row.channel}
                      </span>
                      <div
                        className="flex-1 rounded-full overflow-hidden"
                        style={{ height: 6, background: "var(--ff-table-border)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${barPct}%`, background: color }}
                        />
                      </div>
                      <span
                        className="text-xs font-medium tabular-nums w-28 text-right flex-shrink-0"
                        style={{ color: "var(--ff-table-cell-color)" }}
                      >
                        {formatCurrency(row.projection)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
