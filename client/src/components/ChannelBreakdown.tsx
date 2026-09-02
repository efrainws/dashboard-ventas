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

const CHANNEL_TONE_CLASS: Record<string, string> = {
  "Presencial": "ff-channel-presencial",
  "eCommerce": "ff-channel-ecommerce",
  "Rappi": "ff-channel-rappi",
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
  const toneClass = CHANNEL_TONE_CLASS[entry.name] ?? "ff-channel-default";
  return (
    <div className="ff-chart-tooltip">
      <p className={`font-semibold ${toneClass} ff-channel-text`}>
        {entry.name}
      </p>
      <p>
        {formatCurrency(entry.value)}{" "}
        <span className="text-muted-foreground">
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
      className="ff-chart-pie-label"
      textAnchor="middle"
      dominantBaseline="central"
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
        fill: CHANNEL_CSS_COLOR[s.channel] ?? "var(--ff-granate)",
      })),
    [channelStats]
  );

  if (isLoading) {
    return (
      <Card className="ff-channel-card">
        <CardContent className="py-12 flex items-center justify-center">
          <div className="h-6 w-6 animate-spin border-2 border-[var(--ff-canal-presencial)] border-t-transparent" />
          <span className="ml-2 text-sm text-muted-foreground">
            Calculando métricas por canal...
          </span>
        </CardContent>
      </Card>
    );
  }

  if (channelStats.length === 0) {
    return (
      <Card className="ff-channel-card">
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No hay datos disponibles para el período seleccionado.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="ff-channel-card overflow-hidden">
      <CardHeader className="ff-channel-card-header pb-3">
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
                    <Cell key={i} fill={entry.fill} stroke="var(--surface-card)" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span className="ff-chart-legend">
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
                  const toneClass = CHANNEL_TONE_CLASS[row.channel] ?? "ff-channel-default";
                  return (
                    <tr key={row.channel}>
                      <td>
                        <span
                          className={`ff-channel-chip ${toneClass}`}
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
            <div className="ff-channel-projection">
              <p className="ff-section-label mb-2">
                Proyección Mensual ({daysInMonth} días)
              </p>
              <div className="space-y-1.5">
                {channelStats.map((row) => {
                  const toneClass = CHANNEL_TONE_CLASS[row.channel] ?? "ff-channel-default";
                  const totalProjection = channelStats.reduce((s, r) => s + r.projection, 0);
                  const barPct = totalProjection > 0 ? (row.projection / totalProjection) * 100 : 0;
                  return (
                    <div key={row.channel} className="flex items-center gap-2">
                      <span className="text-xs w-20 flex-shrink-0 text-muted-foreground">
                        {row.channel}
                      </span>
                      <div className="ff-channel-meter">
                        <div
                          className={`ff-channel-meter-fill ${toneClass}`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                      <span className="w-28 flex-shrink-0 text-right text-xs font-medium tabular-nums text-foreground">
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
