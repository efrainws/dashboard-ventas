import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, Package, ShoppingCart, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#8884D8",
  "#82CA9D",
  "#FFC658",
  "#FF6B9D",
  "#C9CBFF",
  "#FFD700",
];

export default function CategorySales() {
  const { data, isLoading, error } = trpc.sales.getSalesByGrandparentCategory.useQuery({});

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-lg font-medium">Cargando datos de categorías...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-destructive">
        <span className="text-lg font-medium">Error al cargar los datos: {error.message}</span>
      </div>
    );
  }

  if (!data || data.categories.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-lg font-medium text-muted-foreground">
          No hay datos disponibles para el período seleccionado
        </span>
      </div>
    );
  }

  const totalSales = data.categories.reduce(
    (sum, cat) => sum + parseFloat(cat.total_sales),
    0
  );
  const totalTransactions = data.categories.reduce(
    (sum, cat) => sum + parseInt(cat.transaction_count),
    0
  );
  const totalItems = data.categories.reduce(
    (sum, cat) => sum + parseInt(cat.items_sold),
    0
  );

  // Preparar datos para gráficos
  const barChartData = data.categories.map((cat) => ({
    name: cat.name.length > 20 ? cat.name.substring(0, 20) + "..." : cat.name,
    fullName: cat.name,
    ventas: parseFloat(cat.total_sales),
  }));

  const pieChartData = data.categories.slice(0, 10).map((cat) => ({
    name: cat.name,
    value: parseFloat(cat.total_sales),
  }));

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver al Dashboard
            </Button>
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Ventas por Categoría Abuelo</h1>
          <p className="text-muted-foreground">
            Análisis de ventas agrupadas por categorías principales.
            {data.metadata && (
              <span className="ml-2 text-xs bg-muted px-2 py-1 rounded-full">
                Período: {new Date(data.metadata.date_range.start).toLocaleDateString()} -{" "}
                {new Date(data.metadata.date_range.end).toLocaleDateString()}
              </span>
            )}
          </p>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ventas Totales</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                SOL {totalSales.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground">
                {data.categories.length} categorías activas
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Transacciones</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalTransactions.toLocaleString("es-PE")}</div>
              <p className="text-xs text-muted-foreground">Total de operaciones</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Productos Vendidos</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalItems.toLocaleString("es-PE")}</div>
              <p className="text-xs text-muted-foreground">Unidades totales</p>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Gráfico de Barras */}
          <Card>
            <CardHeader>
              <CardTitle>Ventas por Categoría</CardTitle>
              <CardDescription>Comparativa de ventas entre categorías principales</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={barChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    fontSize={12}
                  />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number) =>
                      `SOL ${value.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`
                    }
                    labelFormatter={(label, payload) => {
                      if (payload && payload[0]) {
                        return payload[0].payload.fullName;
                      }
                      return label;
                    }}
                  />
                  <Bar dataKey="ventas" fill="#0088FE" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Gráfico de Pastel */}
          <Card>
            <CardHeader>
              <CardTitle>Distribución de Ventas</CardTitle>
              <CardDescription>Proporción de ventas por categoría (Top 10)</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={120}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) =>
                      `SOL ${value.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`
                    }
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Tabla de Datos */}
        <Card>
          <CardHeader>
            <CardTitle>Detalle por Categoría</CardTitle>
            <CardDescription>Información completa de ventas por categoría abuelo</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium">#</th>
                    <th className="text-left p-2 font-medium">Categoría</th>
                    <th className="text-right p-2 font-medium">Ventas Totales</th>
                    <th className="text-right p-2 font-medium">Transacciones</th>
                    <th className="text-right p-2 font-medium">Productos Vendidos</th>
                    <th className="text-right p-2 font-medium">Ticket Promedio</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((cat, index) => {
                    const avgTicket =
                      parseFloat(cat.total_sales) / parseInt(cat.transaction_count);
                    return (
                      <tr key={cat.id} className="border-b hover:bg-muted/50">
                        <td className="p-2 text-muted-foreground">{index + 1}</td>
                        <td className="p-2 font-medium">{cat.name}</td>
                        <td className="p-2 text-right">
                          SOL {parseFloat(cat.total_sales).toLocaleString("es-PE", {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="p-2 text-right">
                          {parseInt(cat.transaction_count).toLocaleString("es-PE")}
                        </td>
                        <td className="p-2 text-right">
                          {parseInt(cat.items_sold).toLocaleString("es-PE")}
                        </td>
                        <td className="p-2 text-right">
                          SOL {avgTicket.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
