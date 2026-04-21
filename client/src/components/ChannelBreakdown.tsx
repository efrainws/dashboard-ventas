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

// ── Design tokens Flora & Fauna ───────────────────────────────────────────────
const FF = {
  carbon:       "#232523",
  humo:         "#919291",
  beige:        "#EAE8E2",
  hueso:        "#F5F4F1",
  blanco:       "#FFFFFF",
  cobalto:      "#1A6894",
  mostaza:      "#C49705",
  esmeralda:    "#008064",
  granate:      "#BC2C46",
  cobaltLight:  "#E8F1F7",
  mostazaLight: "#FDF6E3",
  esmeraldaLight:"#E6F4F1",
};

// Colores por canal — paleta FF
const CHANNEL_COLORS: Record<string, string> = {
  "Presencial": FF.cobalto,
  "eCommerce":  FF.mostaza,
  "Rappi":      FF.esmeralda,
};

const CHANNEL_LIGHT: Record<string, string> = {
  "Presencial": FF.cobaltLight,
  "eCommerce":  FF.mostazaLight,
  "Rappi":      FF.esmeraldaLight,
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
        background: FF.blanco,
        border: `1px solid ${FF.beige}`,
        fontFamily: "'Sailec', sans-serif",
        color: FF.carbon,
      }}
    >
      <p className="font-semibold" style={{ color: entry.payload.fill }}>
        {entry.name}
      </p>
      <p>
        {formatCurrency(entry.value)}{" "}
        <span style={{ color: FF.humo }}>
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
      fill={FF.blanco}
      textAnchor="middle"
      dominantBaseline="central"
      style={{ fontFamily: "'Sailec', sans-serif", fontSize: 12, fontWeight: 600 }}
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
        fill: CHANNEL_COLORS[s.channel] ?? FF.granate,
      })),
    [channelStats]
  );

  if (isLoading) {
    return (
      <Card style={{ border: `1px solid ${FF.beige}` }}>
        <CardContent className="py-12 flex items-center justify-center">
          <div className="h-6 w-6 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: FF.cobalto, borderTopColor: "transparent" }} />
          <span className="ml-2 text-sm" style={{ color: FF.humo, fontFamily: "'Sailec', sans-serif" }}>
            Calculando métricas por canal...
          </span>
        </CardContent>
      </Card>
    );
  }

  if (channelStats.length === 0) {
    return (
      <Card style={{ border: `1px solid ${FF.beige}` }}>
        <CardContent className="py-8 text-center">
          <p className="text-sm" style={{ color: FF.humo, fontFamily: "'Sailec', sans-serif" }}>
            No hay datos disponibles para el período seleccionado.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden" style={{ border: `1px solid ${FF.beige}`, background: FF.blanco }}>
      <CardHeader
        className="pb-3 rounded-t-lg"
        style={{ borderBottom: `1px solid ${FF.beige}`, background: FF.hueso }}
      >
        <CardTitle
          className="text-base uppercase tracking-wide"
          style={{ fontFamily: "'Italian Plate No 1', serif", color: FF.carbon }}
        >
          Análisis por Canal de Venta
        </CardTitle>
        <CardDescription style={{ fontFamily: "'Sailec', sans-serif", color: FF.humo }}>
          Distribución de ventas, transacciones y métricas clave según el canal de venta
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* ── Gráfico de pie ── */}
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-4"
              style={{ color: FF.humo, fontFamily: "'Italian Plate No 1', serif" }}
            >
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
                    <Cell key={i} fill={entry.fill} stroke={FF.blanco} strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span
                      style={{
                        fontFamily: "'Sailec', sans-serif",
                        fontSize: 13,
                        color: FF.carbon,
                      }}
                    >
                      {value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* ── Tabla de métricas ── */}
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-4"
              style={{ color: FF.humo, fontFamily: "'Italian Plate No 1', serif" }}
            >
              Métricas Detalladas
            </p>

            {/* Headers */}
            <div
              className="grid text-sm font-bold uppercase tracking-widest px-3 py-2 rounded-t-md"
              style={{
                gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
                background: FF.hueso,
                color: FF.humo,
                fontFamily: "'Italian Plate No 1', serif",
                borderBottom: `1px solid ${FF.beige}`,
                border: `1px solid ${FF.beige}`,
              }}
            >
              <span>Canal</span>
              <span className="text-right">Ventas</span>
              <span className="text-right">Transac.</span>
              <span className="text-right">Tkt. Prom.</span>
              <span className="text-right">Prom. Día</span>
            </div>

            {/* Filas */}
            <div style={{ border: `1px solid ${FF.beige}`, borderTop: "none", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
              {channelStats.map((row, i) => {
                const color = CHANNEL_COLORS[row.channel] ?? FF.granate;
                const lightColor = CHANNEL_LIGHT[row.channel] ?? "#F5F4F1";
                return (
                  <div
                    key={row.channel}
                    className="grid px-3 py-2.5 text-sm"
                    style={{
                      gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
                      borderBottom: i < channelStats.length - 1 ? `1px solid ${FF.beige}` : "none",
                      background: FF.blanco,
                      fontFamily: "'Sailec', sans-serif",
                    }}
                  >
                    {/* Canal badge */}
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          background: lightColor,
                          color: color,
                          border: `1px solid ${color}33`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.channel}
                      </span>
                    </span>

                    <span className="text-right font-medium tabular-nums" style={{ color: FF.carbon }}>
                      {formatCurrency(row.sales)}
                    </span>
                    <span className="text-right tabular-nums" style={{ color: FF.carbon }}>
                      {formatNumber(row.transactions)}
                    </span>
                    <span className="text-right tabular-nums" style={{ color: FF.carbon }}>
                      {formatCurrency(row.avgTicket)}
                    </span>
                    <span className="text-right tabular-nums" style={{ color: FF.carbon }}>
                      {formatCurrency(row.avgDaily)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Fila de proyección mensual */}
            <div
              className="mt-3 rounded-lg p-3"
              style={{ background: FF.hueso, border: `1px solid ${FF.beige}` }}
            >
              <p
                className="text-[10px] font-bold uppercase tracking-widest mb-2"
                style={{ color: FF.humo, fontFamily: "'Italian Plate No 1', serif" }}
              >
                Proyección Mensual ({daysInMonth} días)
              </p>
              <div className="space-y-1.5">
                {channelStats.map((row) => {
                  const color = CHANNEL_COLORS[row.channel] ?? FF.granate;
                  const totalProjection = channelStats.reduce((s, r) => s + r.projection, 0);
                  const barPct = totalProjection > 0 ? (row.projection / totalProjection) * 100 : 0;
                  return (
                    <div key={row.channel} className="flex items-center gap-2">
                      <span
                        className="text-xs w-20 flex-shrink-0"
                        style={{ color: FF.humo, fontFamily: "'Sailec', sans-serif" }}
                      >
                        {row.channel}
                      </span>
                      <div
                        className="flex-1 rounded-full overflow-hidden"
                        style={{ height: 6, background: FF.beige }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${barPct}%`, background: color }}
                        />
                      </div>
                      <span
                        className="text-xs font-medium tabular-nums w-28 text-right flex-shrink-0"
                        style={{ color: FF.carbon, fontFamily: "'Sailec', sans-serif" }}
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
