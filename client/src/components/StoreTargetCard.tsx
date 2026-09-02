import { Card, CardContent } from "@/components/ui/card";
import { Pencil, Store, ShoppingCart, Bike } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StoreTargetCardProps {
  storeName: string;
  totalSales: number;
  proratedTarget: number;
  completionPercentage: number;
  hasTarget: boolean;
  onEditClick?: () => void;
  canEdit: boolean;
  /** Número de días transcurridos en el período filtrado (para calcular promedio diario) */
  daysElapsed: number;
  /** Número total de días del mes (para calcular la proyección) */
  daysInMonth: number;
  /** Meta mensual completa (sin prorratear), para comparar con la proyección */
  monthlyTarget?: number;
  /** Etiqueta del canal activo para mostrar en la tarjeta (undefined = todos los canales) */
  activeChannelLabel?: string;
}

/** Devuelve una variante semántica global según el porcentaje de cumplimiento. */
function getComplianceTone(pct: number | null): string {
  if (pct === null) return "ff-target-tone--not-set";
  if (pct >= 100) return "ff-target-tone--complete";
  if (pct >= 90) return "ff-target-tone--on-track";
  if (pct >= 75) return "ff-target-tone--attention";
  return "ff-target-tone--critical";
}

const CHANNEL_ICON: Record<string, React.ReactNode> = {
  "Presencial":  <Store className="h-3 w-3" />,
  "eCommerce":   <ShoppingCart className="h-3 w-3" />,
  "Rappi":       <Bike className="h-3 w-3" />,
};

const CHANNEL_TONE: Record<string, string> = {
  "Presencial": "ff-channel-presencial",
  "eCommerce": "ff-channel-ecommerce",
  "Rappi": "ff-channel-rappi",
};

export function StoreTargetCard({
  storeName,
  totalSales,
  proratedTarget,
  completionPercentage,
  hasTarget,
  onEditClick,
  canEdit,
  daysElapsed,
  daysInMonth,
  monthlyTarget,
  activeChannelLabel,
}: StoreTargetCardProps) {
  // ── Cálculos derivados ───────────────────────────────────────────────────
  const dailyAverage = daysElapsed > 0 ? totalSales / daysElapsed : 0;
  const projection   = dailyAverage * daysInMonth;

  // Meta diaria promedio = meta mensual / días del mes
  const dailyTarget =
    monthlyTarget && monthlyTarget > 0 ? monthlyTarget / daysInMonth : null;

  // % proyección vs meta mensual
  const projectionVsTarget =
    monthlyTarget && monthlyTarget > 0
      ? (projection / monthlyTarget) * 100
      : null;

  // % promedio diario vs meta diaria
  const dailyVsTarget =
    dailyTarget && dailyTarget > 0
      ? (dailyAverage / dailyTarget) * 100
      : null;

  const periodTone = getComplianceTone(hasTarget ? completionPercentage : null);
  const projectionTone = getComplianceTone(projectionVsTarget);
  const dailyTone = getComplianceTone(dailyVsTarget);

  // ── Formateo ─────────────────────────────────────────────────────────────
  const fmt = (n: number) =>
    n.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const fmtShort = (n: number) => {
    if (n >= 1_000_000) return `S/ ${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `S/ ${(n / 1_000).toFixed(2)}K`;
    return `S/ ${fmt(n)}`;
  };

  const pctStr = (p: number | null) =>
    p !== null ? `${p.toFixed(1)}%` : "—";

  return (
    <Card className="ff-target-card relative overflow-hidden">
      {/* Botón de edición – posición absoluta para no ocupar espacio */}
      {canEdit && onEditClick && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3 h-7 w-7 z-10 opacity-60 hover:opacity-100"
          onClick={onEditClick}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}

      <CardContent className="pt-5 pb-5 px-5 space-y-3.5">

        {/* ── Línea 1: Nombre de tienda + badge de canal ───────────────── */}
        <div className="pr-8">
          <p className="font-heading text-xl font-bold leading-tight tracking-wide text-foreground">
            {storeName}
          </p>
          {activeChannelLabel && (
            <div className="mt-1 flex flex-wrap gap-1">
              {activeChannelLabel.split(" + ").map((label) => (
                <span
                  key={label}
                  className={`ff-channel-chip ${CHANNEL_TONE[label] ?? "ff-channel-neutral"}`}
                >
                  {CHANNEL_ICON[label] && <span className="mr-0.5">{CHANNEL_ICON[label]}</span>}
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Línea 2: Barra de cumplimiento ───────────────────────────── */}
        {hasTarget ? (
          <div className={`space-y-1 ${periodTone}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Cumplimiento del período
              </span>
              <span className="ff-target-value text-sm font-semibold tabular-nums">
                {completionPercentage.toFixed(1)}%
              </span>
            </div>
            <div className="ff-target-progress">
              <div
                className="ff-target-progress-fill"
                style={{
                  width: `${Math.min(completionPercentage, 100)}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs italic text-muted-foreground">
            Meta no configurada
          </p>
        )}

        {/* Divisor */}
        <div className="ff-target-divider" />

        {/* ── Línea 3: Venta del período vs Meta del período ────────────── */}
        <div className={`space-y-0.5 ${periodTone}`}>
          <p className="ff-target-meta-label">
            Período
          </p>
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="ff-target-value text-lg font-semibold leading-none tabular-nums">
                {fmtShort(totalSales)}
              </span>
              {hasTarget && (
                <span className="ff-target-value text-xs font-medium tabular-nums">
                  ({pctStr(completionPercentage)})
                </span>
              )}
            </div>
            {hasTarget && (
              <span className="flex shrink-0 items-baseline gap-1 text-xs tabular-nums text-muted-foreground">
                <span className="ff-target-meta-label opacity-60">meta</span>
                {fmtShort(proratedTarget)}
              </span>
            )}
          </div>
        </div>

        {/* ── Línea 4: Proyección mensual vs Meta mensual ───────────────── */}
        <div className={`space-y-0.5 ${projectionTone}`}>
          <p className="ff-target-meta-label">
            Proyección mensual
          </p>
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="ff-target-value text-base font-semibold leading-none tabular-nums">
                {fmtShort(projection)}
              </span>
              {projectionVsTarget !== null && (
                <span className="ff-target-value text-xs font-medium tabular-nums">
                  ({pctStr(projectionVsTarget)})
                </span>
              )}
            </div>
            {monthlyTarget && monthlyTarget > 0 ? (
              <span className="flex shrink-0 items-baseline gap-1 text-xs tabular-nums text-muted-foreground">
                <span className="ff-target-meta-label opacity-60">meta</span>
                {fmtShort(monthlyTarget)}
              </span>
            ) : (
              <span className="shrink-0 text-xs italic text-muted-foreground">
                sin meta
              </span>
            )}
          </div>
        </div>

        {/* ── Línea 5: Promedio diario vs Meta diaria ───────────────────── */}
        <div className={`space-y-0.5 ${dailyTone}`}>
          <p className="ff-target-meta-label">
            Promedio diario
          </p>
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="ff-target-value text-base font-semibold leading-none tabular-nums">
                {fmtShort(dailyAverage)}
              </span>
              {dailyVsTarget !== null && (
                <span className="ff-target-value text-xs font-medium tabular-nums">
                  ({pctStr(dailyVsTarget)})
                </span>
              )}
            </div>
            {dailyTarget !== null ? (
              <span className="flex shrink-0 items-baseline gap-1 text-xs tabular-nums text-muted-foreground">
                <span className="ff-target-meta-label opacity-60">meta</span>
                {fmtShort(dailyTarget)}
              </span>
            ) : (
              <span className="shrink-0 text-xs italic text-muted-foreground">
                sin meta
              </span>
            )}
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
