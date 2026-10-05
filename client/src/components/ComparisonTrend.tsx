import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { compareMetric, formatSignedNumber } from "@shared/comparisonMetrics";

type ComparisonTrendProps = {
  current: number;
  comparison: number;
  formatValue: (value: number) => string;
  formatDifference?: (value: number) => string;
  label: string;
  className?: string;
};

export function ComparisonTrend({
  current,
  comparison,
  formatValue,
  formatDifference = formatValue,
  label,
  className = "",
}: ComparisonTrendProps) {
  const result = compareMetric(current, comparison);
  const direction = result.difference > 0 ? "up" : result.difference < 0 ? "down" : "flat";
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : ArrowRight;
  const tone = direction === "up" ? "text-emerald-700 dark:text-emerald-300" : direction === "down" ? "text-rose-700 dark:text-rose-300" : "text-muted-foreground";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-1 ${tone} ${className}`} aria-label={`Variación de ${label}`}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="text-xs font-semibold tabular-nums">
            {result.percentage === null ? "N/C" : `${formatSignedNumber(result.percentage, 1)}%`}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="font-semibold">{label}</p>
        <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Principal</dt><dd className="text-right tabular-nums">{formatValue(result.current)}</dd>
          <dt className="text-muted-foreground">Comparativo</dt><dd className="text-right tabular-nums">{formatValue(result.comparison)}</dd>
          <dt className="text-muted-foreground">Diferencia</dt><dd className="text-right tabular-nums">{formatDifference(result.difference)}</dd>
          <dt className="text-muted-foreground">Variación</dt><dd className="text-right tabular-nums">{result.percentage === null ? "No calculable" : `${formatSignedNumber(result.percentage, 1)}%`}</dd>
        </dl>
      </TooltipContent>
    </Tooltip>
  );
}
