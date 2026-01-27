import { DashboardCharts } from "@/components/DashboardCharts";
import { DashboardFilters } from "@/components/DashboardFilters";
import { DashboardStats } from "@/components/DashboardStats";
import { SalesTable } from "@/components/SalesTable";
import { Filters, useFilteredSales, useSalesData } from "@/hooks/useSalesData";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut, Shield, User as UserIcon, BarChart3 } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Link } from "wouter";

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      // Redirigir al login después del logout
      setLocation('/login');
    },
  });
  
  const handleLogout = () => {
    logoutMutation.mutate();
  };
  const { data, loading, error } = useSalesData();
  const [filters, setFilters] = useState<Filters>({
    branch: 'all',
    paymentMethod: 'all',
    year: 'all',
    monthYear: 'all',
    dateRange: { from: undefined, to: undefined }
  });

  const filteredSales = useFilteredSales(data, filters);

  // Calcular meses disponibles a partir de los datos
  const availableMonths = useMemo(() => {
    if (!data) return [];
    const months = new Set(data.sales.map(s => s.month_str));
    return Array.from(months).sort().reverse();
  }, [data]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-lg font-medium">Cargando datos...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-destructive">
        <span className="text-lg font-medium">{error}</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 space-y-8">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex flex-col space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Dashboard de Ventas</h1>
            <p className="text-muted-foreground">
              Visualización interactiva de ventas y transacciones.
              {data?.metadata && (
                <span className="ml-2 text-xs bg-muted px-2 py-1 rounded-full">
                  Actualizado: {data.metadata.generated_at}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md">
              {user?.role === 'admin' ? (
                <Shield className="h-4 w-4 text-primary" />
              ) : (
                <UserIcon className="h-4 w-4" />
              )}
              <span className="font-medium">{user?.name}</span>
              <span className="text-xs opacity-70 capitalize">({user?.role})</span>
            </div>
            <Link href="/categorias">
              <Button variant="outline" size="sm">
                <BarChart3 className="mr-2 h-4 w-4" />
                Ver Categorías
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={handleLogout} disabled={logoutMutation.isPending}>
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar Sesión
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <DashboardFilters
          filters={filters}
          setFilters={setFilters}
          branches={data?.branches || []}
          paymentMethods={data?.payment_methods || []}
          availableMonths={availableMonths}
        />

        {/* KPIs */}
        <DashboardStats sales={filteredSales} />

        {/* Gráficos */}
        <DashboardCharts sales={filteredSales} />

        {/* Tabla de Datos - Solo visible para Admin */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Detalle de Transacciones</h2>
          {user?.role === 'admin' ? (
            <SalesTable sales={filteredSales} />
          ) : (
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertTitle>Acceso Restringido</AlertTitle>
              <AlertDescription>
                Solo los administradores pueden ver el detalle de transacciones individual.
                Contacta a soporte si necesitas acceso.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
