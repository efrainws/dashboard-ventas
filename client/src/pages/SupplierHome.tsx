import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { NavigationMenu } from "@/components/NavigationMenu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Package, ShieldOff } from "lucide-react";
import { Redirect } from "wouter";

/**
 * Página principal exclusiva para Usuario Proveedor (supplier_user).
 * Los usuarios de otros roles no pueden acceder aquí — se redirigen a Home.
 */
export default function SupplierHome() {
  const { user, loading } = useAuth();
  const { effectiveTheme } = useTheme();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Si no es supplier_user, redirigir a la home general
  if (!user || user.role !== "supplier_user") {
    return <Redirect to="/" />;
  }

  const logoSrc = effectiveTheme === "dark" ? "/Logoclarochico.svg" : "/Logonegro.svg";

  return (
    <div className="min-h-screen bg-background">
      <NavigationMenu />

      <div className="container py-12 space-y-10">
        {/* Hero */}
        <div className="flex flex-col space-y-3">
          <img src={logoSrc} alt="Flora & Fauna" className="h-8 w-auto object-contain self-start" />
          <h1
            className="text-4xl font-bold tracking-tight uppercase"
            style={{ fontFamily: "Italian Plate No 1, serif" }}
          >
            Portal de Proveedores
          </h1>
          <p className="text-muted-foreground text-lg" style={{ fontFamily: "Sailec, sans-serif" }}>
            Bienvenido, <span className="font-semibold text-foreground">{user.name ?? user.username}</span>.
            Aquí encontrarás los módulos y reportes disponibles para tu perfil.
          </p>
        </div>

        {/* Módulos disponibles para proveedor */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Placeholder: módulo de reportes de proveedor */}
          <Card className="border border-border hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="pb-3">
              <div className="w-10 h-10 rounded-lg bg-[#008064]/10 flex items-center justify-center mb-2">
                <Package className="h-5 w-5 text-[#008064]" />
              </div>
              <CardTitle
                className="text-base uppercase tracking-wide"
                style={{ fontFamily: "Italian Plate No 1, serif" }}
              >
                Mis Reportes
              </CardTitle>
              <CardDescription style={{ fontFamily: "Sailec, sans-serif" }}>
                Consulta el desempeño y métricas asociadas a tu proveedor
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground" style={{ fontFamily: "Sailec, sans-serif" }}>
                Módulo en desarrollo — próximamente disponible
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
