import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  previousValue?: number;
  format?: "currency" | "number" | "percent";
  icon?: React.ReactNode;
  showComparison?: boolean;
}

export function KPICard({
  title,
  value,
  previousValue,
  format = "currency",
  icon,
  showComparison = true,
}: KPICardProps) {
  const formatValue = (val: string | number) => {
    if (typeof val === "string") return val;
    
    if (format === "currency") {
      return new Intl.NumberFormat("es-PE", {
        style: "currency",
        currency: "PEN",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(val);
    }
    
    if (format === "number") {
      return new Intl.NumberFormat("es-PE").format(val);
    }
    
    if (format === "percent") {
      return `${val.toFixed(1)}%`;
    }
    
    return val.toString();
  };

  const calculateChange = () => {
    if (!showComparison || previousValue === undefined || previousValue === 0) {
      return null;
    }

    const currentVal = typeof value === "string" ? parseFloat(value) : value;
    const change = currentVal - previousValue;
    const percentChange = (change / previousValue) * 100;

    return {
      absolute: change,
      percent: percentChange,
      isPositive: change > 0,
      isNeutral: Math.abs(percentChange) < 0.1,
    };
  };

  const change = calculateChange();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatValue(value)}</div>
        {change && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            {change.isNeutral ? (
              <>
                <Minus className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Sin cambio vs. período anterior
                </span>
              </>
            ) : change.isPositive ? (
              <>
                <TrendingUp className="h-3 w-3 text-green-600" />
                <span className="text-green-600 font-medium">
                  +{change.percent.toFixed(1)}%
                </span>
                <span className="text-muted-foreground">
                  (+{formatValue(change.absolute)})
                </span>
              </>
            ) : (
              <>
                <TrendingDown className="h-3 w-3 text-red-600" />
                <span className="text-red-600 font-medium">
                  {change.percent.toFixed(1)}%
                </span>
                <span className="text-muted-foreground">
                  ({formatValue(change.absolute)})
                </span>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
