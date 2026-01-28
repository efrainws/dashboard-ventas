import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sale } from "@/hooks/useSalesData";
import { CreditCard, DollarSign, ShoppingBag, TrendingUp } from "lucide-react";
import { useMemo } from "react";

interface DashboardStatsProps {
  sales: Sale[];
}

export function DashboardStats({ sales }: DashboardStatsProps) {
  const stats = useMemo(() => {
    const totalSales = sales.reduce((acc, sale) => acc + sale.total, 0);
    const totalTransactions = sales.length;
    const averageTicket = totalTransactions > 0 ? totalSales / totalTransactions : 0;
    
    // Calcular crecimiento (simulado comparando primera mitad vs segunda mitad del periodo seleccionado)
    // En un caso real, esto se haría comparando con el periodo anterior
    const midPoint = Math.floor(sales.length / 2);
    const recentSales = sales.slice(0, midPoint).reduce((acc, sale) => acc + sale.total, 0);
    const olderSales = sales.slice(midPoint).reduce((acc, sale) => acc + sale.total, 0);
    const growth = olderSales > 0 ? ((recentSales - olderSales) / olderSales) * 100 : 0;

    return {
      totalSales,
      totalTransactions,
      averageTicket,
      growth
    };
  }, [sales]);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Ventas Totales</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            SOL {stats.totalSales.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-muted-foreground">
            En el periodo seleccionado
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Transacciones</CardTitle>
          <ShoppingBag className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalTransactions.toLocaleString('es-PE')}</div>
          <p className="text-xs text-muted-foreground">
            Total de operaciones
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Ticket Promedio</CardTitle>
          <CreditCard className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            SOL {stats.averageTicket.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-muted-foreground">
            Promedio por venta
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Tendencia</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.growth > 0 ? '+' : ''}{stats.growth.toFixed(1)}%
          </div>
          <p className="text-xs text-muted-foreground">
            Comparativa periodo actual
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
