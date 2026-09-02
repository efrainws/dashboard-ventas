import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NavigationMenu } from "@/components/NavigationMenu";
import {
  ArrowUpRight,
  BarChart3,
  Clock,
  FolderTree,
  Gauge,
  LayoutGrid,
  Loader2,
  ReceiptText,
  Target,
  TrendingUp,
  Trophy,
  UserCheck,
  Users,
} from "lucide-react";
import { getLoginUrl } from "@/const";

const roleLabels: Record<string, string> = {
  system_specialist: "Especialista de Sistemas",
  operations_specialist: "Especialista de Operaciones",
  cst_user: "Usuario CST",
  commercial_specialist: "Especialista Comercial",
  store_user: "Usuario Tienda",
  supplier_user: "Usuario Proveedor",
  own_brand_user: "Usuario Marca Propia",
  admin: "Administrador",
};

type Module = {
  title: string;
  description: string;
  icon: React.ElementType;
  href: string;
  tone: string;
  iconColor: string;
};

function ModuleCard({ module }: { module: Module }) {
  const Icon = module.icon;

  return (
    <Link
      href={module.href}
      className="group block h-full focus:outline-none"
      aria-label={`Abrir ${module.title}`}
    >
      <Card className="ff-module-card h-full group-focus-visible:border-primary group-focus-visible:shadow-[var(--shadow-focus)]">
        <CardHeader>
          <span
            className="ff-module-mark mb-4"
            style={{ backgroundColor: module.tone }}
            aria-hidden="true"
          >
            <Icon className="h-5 w-5" style={{ color: module.iconColor }} />
          </span>
          <CardTitle className="text-xl">{module.title}</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            {module.description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <span className="flex items-center justify-between border-t border-border pt-4 font-heading text-xs font-bold uppercase tracking-[0.1em] text-primary">
            Abrir módulo
            <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

function ModuleSection({
  eyebrow,
  title,
  count,
  icon: Icon,
  iconClassName,
  modules,
  id,
}: {
  eyebrow: string;
  title: string;
  count: number;
  icon: React.ElementType;
  iconClassName: string;
  modules: Module[];
  id: string;
}) {
  return (
    <section className="space-y-6" aria-labelledby={id}>
      <div className="flex items-end justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <span className={`ff-module-mark ${iconClassName}`} aria-hidden="true">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <p className="ff-eyebrow">{eyebrow}</p>
            <h2 id={id} className="mt-1 text-2xl font-semibold tracking-tight">
              {title}
            </h2>
          </div>
        </div>
        <span className="hidden text-sm text-muted-foreground sm:block">
          {count} módulos
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => <ModuleCard key={module.href} module={module} />)}
      </div>
    </section>
  );
}

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Cargando" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationMenu />
        <main className="container py-16 sm:py-24">
          <div className="border-y border-border bg-secondary/60 px-6 py-12 sm:px-10 sm:py-16">
            <p className="ff-eyebrow">Centro de análisis</p>
            <h1 className="ff-page-title mt-4 max-w-3xl">Dashboard de ventas</h1>
            <p className="ff-page-intro mt-5">
              Consulta el desempeño comercial de Flora & Fauna por tienda, producto y período.
            </p>
            <Button size="lg" className="mt-8" asChild>
              <a href={getLoginUrl()}>Iniciar sesión</a>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const salesModules: Module[] = [
    {
      title: "Análisis general",
      description: "Visualiza ventas agregadas por fecha, tienda y departamento con métricas clave.",
      icon: BarChart3,
      href: "/sales",
      tone: "var(--ff-carbon)",
      iconColor: "var(--ff-crema)",
    },
    {
      title: "Análisis por horas",
      description: "Explora patrones de ventas por hora del día y optimiza la operación.",
      icon: Clock,
      href: "/hourly",
      tone: "var(--ff-mostaza)",
      iconColor: "var(--ff-carbon)",
    },
    {
      title: "Ventas vs meta",
      description: "Monitorea el cumplimiento de metas mensuales por tienda con indicadores claros.",
      icon: Target,
      href: "/sales-vs-target",
      tone: "var(--ff-esmeralda)",
      iconColor: "var(--ff-blanco)",
    },
    {
      title: "Top 50 productos",
      description: "Revisa los productos con mayor cantidad vendida y monto de ventas.",
      icon: Trophy,
      href: "/top-products",
      tone: "var(--ff-cobalto)",
      iconColor: "var(--ff-crema)",
    },
    {
      title: "Top clientes",
      description: "Consulta a los clientes con mayor monto de compra por tienda y período.",
      icon: Users,
      href: "/top-customers",
      tone: "var(--ff-mostaza)",
      iconColor: "var(--ff-carbon)",
    },
    {
      title: "Análisis por góndola",
      description: "Analiza las ventas por posición de góndola con mapa y comparación de períodos.",
      icon: LayoutGrid,
      href: "/sales-by-shelf",
      tone: "var(--ff-esmeralda)",
      iconColor: "var(--ff-blanco)",
    },
    {
      title: "Análisis por categorías",
      description: "Profundiza por departamento, sección y familia con evolución y detalle de artículos.",
      icon: FolderTree,
      href: "/sales-by-category",
      tone: "var(--ff-carbon)",
      iconColor: "var(--ff-crema)",
    },
  ];

  const opsModules: Module[] = [
    {
      title: "Transacciones identificadas",
      description: "Analiza el porcentaje de transacciones con cliente identificado por tienda y período.",
      icon: UserCheck,
      href: "/identified-transactions",
      tone: "var(--ff-granate)",
      iconColor: "var(--ff-blanco)",
    },
    {
      title: "Notas de crédito",
      description: "Revisa las notas de crédito emitidas por tienda y su desglose por cajero.",
      icon: ReceiptText,
      href: "/credit-notes",
      tone: "var(--ff-granate)",
      iconColor: "var(--ff-blanco)",
    },
  ];

  const moduleCount = salesModules.length + (user?.role !== "own_brand_user" ? opsModules.length : 0);

  return (
    <div className="min-h-screen bg-background">
      <NavigationMenu />
      <main className="container space-y-14 py-12 sm:space-y-16 sm:py-16">
        <header className="border-b border-border pb-9 sm:pb-11">
          <p className="ff-eyebrow">Centro de control comercial</p>
          <h1 className="ff-page-title mt-4">Bienvenido, {user?.name}</h1>
          <p className="ff-page-intro mt-5">
            Revisa los indicadores clave y profundiza en el desempeño de ventas de Flora & Fauna.
          </p>
        </header>

        <ModuleSection
          eyebrow="Análisis comercial"
          title="Módulos de ventas"
          count={salesModules.length}
          icon={TrendingUp}
          iconClassName="bg-secondary text-primary"
          modules={salesModules}
          id="sales-modules-title"
        />

        {user?.role !== "own_brand_user" && (
          <ModuleSection
            eyebrow="Seguimiento operativo"
            title="Indicadores de operación"
            count={opsModules.length}
            icon={Gauge}
            iconClassName="bg-[var(--ff-rosado)] text-destructive"
            modules={opsModules}
            id="operations-modules-title"
          />
        )}

        <section className="border-y border-border bg-secondary/60 px-5 py-6 sm:px-8" aria-labelledby="system-info-title">
          <p className="ff-eyebrow">Tu espacio de trabajo</p>
          <h2 id="system-info-title" className="mt-2 text-xl font-semibold tracking-tight">Información del sistema</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            <div className="border-l-2 border-primary pl-3">
              <p className="ff-eyebrow">Usuario</p>
              <p className="mt-1 font-medium">{user?.name}</p>
            </div>
            <div className="border-l-2 border-primary pl-3">
              <p className="ff-eyebrow">Rol</p>
              <p className="mt-1 font-medium">{roleLabels[user?.role ?? ""] ?? user?.role}</p>
            </div>
            <div className="border-l-2 border-primary pl-3">
              <p className="ff-eyebrow">Módulos disponibles</p>
              <p className="mt-1 font-medium">{moduleCount} módulos activos</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
