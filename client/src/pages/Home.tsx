import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NavigationMenu } from "@/components/NavigationMenu";
import { BarChart3, Clock, Target, TrendingUp, Loader2 } from "lucide-react";
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
  const salesModules = [
    {
      title: "Análisis por Categorías",
      description: "Visualiza ventas agregadas por fecha, tienda y departamento con métricas clave",
      icon: BarChart3,
      href: "/sales",
      color: "text-[#1A6894]", // Cobalto
      bgColor: "bg-[#1A6894]/10",
    },
    {
      title: "Análisis por Horas",
      description: "Explora patrones de ventas por hora del día y optimiza la operación",
      icon: Clock,
      href: "/hourly",
      color: "text-[#C49705]", // Mostaza
      bgColor: "bg-[#C49705]/10",
    },
    {
      title: "Ventas vs Meta",
      description: "Monitorea el cumplimiento de metas mensuales por tienda con indicadores visuales",
      icon: Target,
      href: "/sales-vs-target",
      color: "text-[#008064]", // Esmeralda
      bgColor: "bg-[#008064]/10",
    },
  ];

  // Logo según tema
  const logoSrc = effectiveTheme === "dark" ? "/Logoclarochico.svg" : "/Logonegro.svg";

  return (
    <div className="min-h-screen bg-background">
      <NavigationMenu />
      
      <div className="container py-12 space-y-12">
        {/* Logo */}
        <div className="flex justify-start">
          <img 
            src={logoSrc}
            alt="Flora & Fauna" 
            className="h-6 w-auto" 
          />
        </div>

        {/* Hero Section */}
        <div className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight uppercase" style={{ fontFamily: 'Italian Plate No 1, serif' }}>
            Bienvenido, {user?.name}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Accede a los diferentes módulos de análisis para obtener insights sobre el desempeño de ventas de Flora & Fauna.
          </p>
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
              <p className="font-medium">{salesModules.length} módulos activos</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
