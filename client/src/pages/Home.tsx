import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NavigationMenu } from "@/components/NavigationMenu";
import { BarChart3, Clock, Target, TrendingUp, Loader2, UserCheck, Trophy, ReceiptText, Users, LayoutGrid, FolderTree, Gauge } from "lucide-react";
import { getLoginUrl } from "@/const";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationMenu />
        <div className="container py-16">
          <div className="max-w-3xl mx-auto text-center space-y-8">
            <h1 className="text-5xl font-bold tracking-tight" style={{ fontFamily: 'Italian Plate No 1, serif' }}>
              Dashboard de Ventas
            </h1>
            <p className="text-xl text-muted-foreground">
              Sistema de análisis y visualización de datos de ventas para Flora & Fauna
            </p>
            <Button size="lg" asChild>
              <a href={getLoginUrl()}>Iniciar Sesión para Acceder</a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const { effectiveTheme } = useTheme();

  // Colores de la paleta Flora & Fauna
  // bgColor = color sólido corporativo como fondo del ícono
  // color = variación light del mismo color para las líneas del ícono
  const salesModules = [
    {
      title: "Análisis General",
      description: "Visualiza ventas agregadas por fecha, tienda y departamento con métricas clave",
      icon: BarChart3,
      href: "/sales",
      color: "text-[#EAE8E2]", // Beige
      bgColor: "bg-[#1A6894]", // Cobalto
    },
    {
      title: "Análisis por Horas",
      description: "Explora patrones de ventas por hora del día y optimiza la operación",
      icon: Clock,
      href: "/hourly",
      color: "text-[#EAE8E2]", // Beige
      bgColor: "bg-[#C49705]", // Mostaza
    },
    {
      title: "Ventas vs Meta",
      description: "Monitorea el cumplimiento de metas mensuales por tienda con indicadores visuales",
      icon: Target,
      href: "/sales-vs-target",
      color: "text-[#EAE8E2]", // Beige
      bgColor: "bg-[#008064]", // Esmeralda
    },

    {
      title: "Top 50 Productos",
      description: "Ranking de los 50 mejores productos por cantidad vendida y por monto de ventas",
      icon: Trophy,
      href: "/top-products",
      color: "text-[#EAE8E2]", // Beige
      bgColor: "bg-[#5BB6B7]", // Celeste
    },

    {
      title: "Top Clientes",
      description: "Ranking de los mejores clientes por monto de compra por tienda y período",
      icon: Users,
      href: "/top-customers",
      color: "text-[#EAE8E2]", // Beige
      bgColor: "bg-[#C49705]", // Mostaza
    },
    {
      title: "Análisis por Góndola",
      description: "Visualiza ventas por posición de góndola en tienda con heatmap y comparación de períodos",
      icon: LayoutGrid,
      href: "/sales-by-shelf",
      color: "text-[#EAE8E2]", // Beige
      bgColor: "bg-[#005A47]", // Esmeralda oscuro
    },
    {
      title: "Análisis por Categorías",
      description: "Explora ventas por departamento, sección y familia con gráfico de líneas, distribución y detalle de artículos",
      icon: FolderTree,
      href: "/sales-by-category",
      color: "text-[#EAE8E2]", // Beige
      bgColor: "bg-[#6B3FA0]", // Púrpura
    },
  ];

  const opsModules = [
    {
      title: "Transacciones Identificadas",
      description: "Analiza el porcentaje de transacciones con cliente identificado por tienda y período",
      icon: UserCheck,
      href: "/identified-transactions",
      color: "text-[#EAE8E2]",
      bgColor: "bg-[#BC2C46]", // Granate
    },
    {
      title: "Notas de Crédito",
      description: "Detalle de notas de crédito emitidas por tienda con breakdown por cajero",
      icon: ReceiptText,
      href: "/credit-notes",
      color: "text-[#EAE8E2]",
      bgColor: "bg-[#BC2C46]", // Granate
    },
  ];

  // Logo según tema
  const logoSrc = effectiveTheme === "dark" ? "/Logoclarochico.svg" : "/Logonegro.svg";

  return (
    <div className="min-h-screen bg-background">
      <NavigationMenu />
      
      <div className="container py-12 space-y-12">
        {/* Logo y Hero Section */}
        <div className="space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold tracking-tight uppercase" style={{ fontFamily: 'Italian Plate No 1, serif' }}>
              Bienvenido, {user?.name}
            </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Accede a los diferentes módulos de análisis para obtener insights sobre el desempeño de ventas de Flora & Fauna.
          </p>
          </div>
        </div>

        {/* Sales Modules Section */}
        <div className="space-y-6">
          <div className="flex items-center space-x-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-semibold tracking-tight">Módulos de Ventas</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {salesModules.map((module) => {
              const Icon = module.icon;
              return (
                <Link key={module.href} href={module.href}>
                  <div className="block h-full">
                    <Card className="h-full transition-all hover:shadow-lg hover:scale-105 cursor-pointer">
                      <CardHeader>
                        <div className={`w-12 h-12 rounded-lg ${module.bgColor} flex items-center justify-center mb-4`}>
                          <Icon className={`h-6 w-6 ${module.color}`} />
                        </div>
                        <CardTitle className="text-xl">{module.title}</CardTitle>
                        <CardDescription className="text-sm">
                          {module.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button variant="outline" className="w-full">
                          Acceder al Módulo
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Indicadores de Operación Section */}
        <div className="space-y-6">
          <div className="flex items-center space-x-2">
            <Gauge className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-semibold tracking-tight">Indicadores de Operación</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {opsModules.map((module) => {
              const Icon = module.icon;
              return (
                <Link key={module.href} href={module.href}>
                  <div className="block h-full">
                    <Card className="h-full transition-all hover:shadow-lg hover:scale-105 cursor-pointer">
                      <CardHeader>
                        <div className={`w-12 h-12 rounded-lg ${module.bgColor} flex items-center justify-center mb-4`}>
                          <Icon className={`h-6 w-6 ${module.color}`} />
                        </div>
                        <CardTitle className="text-xl">{module.title}</CardTitle>
                        <CardDescription className="text-sm">
                          {module.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button variant="outline" className="w-full">
                          Acceder al Módulo
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Quick Stats or Additional Info */}
        <div className="bg-muted/50 rounded-lg p-8 space-y-4">
          <h3 className="text-lg font-semibold">Información del Sistema</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Usuario</p>
              <p className="font-medium">{user?.name}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Rol</p>
              <p className="font-medium capitalize">{user?.role}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Módulos Disponibles</p>
              <p className="font-medium">{salesModules.length + opsModules.length} módulos activos</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
