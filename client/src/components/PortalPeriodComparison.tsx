import { ArrowDownRight, ArrowUpRight, CalendarRange, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { percentageVariation } from "@shared/periodComparison";

interface Metric {
  label: string;
  current: number | string | null | undefined;
  previous: number | string | null | undefined;
  format: (value: number | string | null | undefined) => string;
}

interface PortalPeriodComparisonProps {
  currentRange: { from: string; to: string };
  previousRange: { from: string; to: string };
  metrics: Metric[];
  isLoading?: boolean;
}

export function PortalPeriodComparison({ currentRange, previousRange, metrics, isLoading }: PortalPeriodComparisonProps) {
  return (
    <Card className="border-border/60 bg-muted/20">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-[190px] items-start gap-2">
          <CalendarRange className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <p className="ff-eyebrow">Comparación de período</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Actual: {currentRange.from} a {currentRange.to}
            </p>
            <p className="text-xs text-muted-foreground">
              Referencia: {previousRange.from} a {previousRange.to}
            </p>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          {metrics.map((metric) => {
            const variation = percentageVariation(metric.current, metric.previous);
            const isPositive = variation != null && variation > 0;
            const isNegative = variation != null && variation < 0;
            const Icon = isPositive ? ArrowUpRight : isNegative ? ArrowDownRight : Minus;
            return (
              <div key={metric.label} className="border-l border-border/70 pl-3">
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                {isLoading ? (
                  <Skeleton className="mt-1 h-5 w-20" />
                ) : (
                  <>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums">{metric.format(metric.current)}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Icon className={isPositive ? "h-3 w-3 text-[var(--ff-esmeralda)]" : isNegative ? "h-3 w-3 text-destructive" : "h-3 w-3"} />
                      {variation == null ? "Sin base comparable" : `${variation >= 0 ? "+" : ""}${variation.toFixed(1)}% vs. período previo`}
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
