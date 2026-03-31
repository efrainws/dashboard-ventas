import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import {
  LogOut,
  User,
  ChevronDown,
  Home,
  BarChart3,
  Clock,
  Target,
  Ticket,
  Users,
  UserCheck,
  Truck,
  Menu,
  X,
  Trophy,
  Activity,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";

export function NavigationMenu() {
  const [location] = useLocation();
  const { user, logout, isAuthenticated } = useAuth();
  const { effectiveTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [salesExpanded, setSalesExpanded] = useState(false);

  const { data: openTicketCount } = trpc.tickets.countOpen.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "system_specialist",
    refetchInterval: 60_000,
  });

  // Logo según tema
  const logoSrc = effectiveTheme === "dark" ? "/Logoclarochico.svg" : "/Logonegro.svg";

  const isActive = (path: string) => location === path;
  const isSalesActive =
    location.startsWith("/sales") ||
    location.startsWith("/hourly") ||
    location.startsWith("/sales-vs-target") ||
    location.startsWith("/identified-transactions") ||
    location.startsWith("/top-products");

  const closeMobile = () => {
    setMobileOpen(false);
    setSalesExpanded(false);
  };

  if (!isAuthenticated) {
    return (
      <nav className="border-b bg-background">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <img src={logoSrc} alt="Flora & Fauna" className="h-6 w-auto" />
          </Link>
          <Button asChild>
            <a href={getLoginUrl()}>Iniciar Sesión</a>
          </Button>
        </div>
      </nav>
    );
  }

  return (
    <nav className="border-b bg-background sticky top-0 z-50">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center space-x-2" onClick={closeMobile}>
          <img src={logoSrc} alt="Flora & Fauna" className="h-6 w-auto" />
        </Link>

        {/* ── DESKTOP NAV (md+) ── */}
        <div className="hidden md:flex items-center space-x-6">
          <Link
            href="/"
            className={`flex items-center space-x-1 text-sm font-medium transition-colors hover:text-primary ${
              isActive("/") ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Home className="h-4 w-4" />
            <span>Inicio</span>
          </Link>

          {/* Dropdown Ventas */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={`flex items-center space-x-1 text-sm font-medium ${
                  isSalesActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <BarChart3 className="h-4 w-4" />
                <span>Ventas</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Análisis de Ventas</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link href="/sales" className="flex items-center w-full cursor-pointer">
                    <BarChart3 className="mr-2 h-4 w-4" />
                    <span>Análisis por Categorías</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/hourly" className="flex items-center w-full cursor-pointer">
                    <Clock className="mr-2 h-4 w-4" />
                    <span>Análisis por Horas</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/sales-vs-target" className="flex items-center w-full cursor-pointer">
                    <Target className="mr-2 h-4 w-4" />
                    <span>Ventas vs Meta</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/identified-transactions" className="flex items-center w-full cursor-pointer">
                    <UserCheck className="mr-2 h-4 w-4" />
                    <span>Transacciones Identificadas</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/top-products" className="flex items-center w-full cursor-pointer">
                    <Trophy className="mr-2 h-4 w-4" />
                    <span>Top 50 Productos</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Tickets */}
          <Link
            href="/tickets"
            className={`relative flex items-center space-x-1 text-sm font-medium transition-colors hover:text-primary ${
              isActive("/tickets") ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Ticket className="h-4 w-4" />
            <span>Tickets</span>
            {openTicketCount !== undefined && openTicketCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {openTicketCount > 99 ? "99+" : openTicketCount}
              </span>
            )}
          </Link>

          {/* Usuarios — solo system_specialist */}
          {user?.role === "system_specialist" && (
            <Link
              href="/admin/users"
              className={`flex items-center space-x-1 text-sm font-medium transition-colors hover:text-primary ${
                isActive("/admin/users") ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Users className="h-4 w-4" />
              <span>Usuarios</span>
            </Link>
          )}

          {/* Portal Proveedores — solo system_specialist y commercial_specialist */}
          {(user?.role === "system_specialist" || user?.role === "commercial_specialist") && (
            <Link
              href="/supplier"
              className={`flex items-center space-x-1 text-sm font-medium transition-colors hover:text-primary ${
                isActive("/supplier") ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Truck className="h-4 w-4" />
              <span>Ventas por Proveedor</span>
            </Link>
          )}

          {/* Administración proveedores — solo system_specialist y commercial_specialist */}
          {(user?.role === "system_specialist" || user?.role === "commercial_specialist") && (
            <Link
              href="/monitoreo-proveedores"
              className={`flex items-center space-x-1 text-sm font-medium transition-colors hover:text-primary ${
                isActive("/monitoreo-proveedores") || isActive("/afiliacion") ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Activity className="h-4 w-4" />
              <span>Administración de Proveedores</span>
            </Link>
          )}

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center space-x-2">
                <User className="h-4 w-4" />
                <span className="text-sm font-medium">{user?.name}</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {user?.role === 'system_specialist' ? 'Especialista de Sistemas'
                      : user?.role === 'cst_user' ? 'Usuario CST'
                      : user?.role === 'commercial_specialist' ? 'Especialista Comercial'
                      : user?.role === 'store_user' ? 'Usuario Tienda'
                      : user?.role === 'supplier_user' ? 'Usuario Proveedor'
                      : user?.role === 'own_brand_user' ? 'Usuario Marca Propia'
                      : user?.role}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Cerrar Sesión</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* ── MOBILE: hamburger button ── */}
        <button
          className="md:hidden flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* ── MOBILE DROPDOWN PANEL ── */}
      {mobileOpen && (
        <div className="md:hidden border-t bg-background">
          <div className="container py-3 flex flex-col space-y-1">

            {/* Inicio */}
            <Link
              href="/"
              onClick={closeMobile}
              className={`flex items-center space-x-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive("/")
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              <Home className="h-4 w-4 shrink-0" />
              <span>Inicio</span>
            </Link>

            {/* Ventas — sección expandible */}
            <div>
              <button
                onClick={() => setSalesExpanded((prev) => !prev)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isSalesActive
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <span className="flex items-center space-x-3">
                  <BarChart3 className="h-4 w-4 shrink-0" />
                  <span>Ventas</span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${
                    salesExpanded ? "rotate-180" : ""
                  }`}
                />
              </button>

              {salesExpanded && (
                <div className="mt-1 ml-4 pl-3 border-l border-border flex flex-col space-y-1">
                  <Link
                    href="/sales"
                    onClick={closeMobile}
                    className={`flex items-center space-x-3 px-3 py-2 rounded-md text-sm transition-colors ${
                      isActive("/sales")
                        ? "text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <BarChart3 className="h-4 w-4 shrink-0" />
                    <span>Análisis por Categorías</span>
                  </Link>
                  <Link
                    href="/hourly"
                    onClick={closeMobile}
                    className={`flex items-center space-x-3 px-3 py-2 rounded-md text-sm transition-colors ${
                      isActive("/hourly")
                        ? "text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <Clock className="h-4 w-4 shrink-0" />
                    <span>Análisis por Horas</span>
                  </Link>
                  <Link
                    href="/sales-vs-target"
                    onClick={closeMobile}
                    className={`flex items-center space-x-3 px-3 py-2 rounded-md text-sm transition-colors ${
                      isActive("/sales-vs-target")
                        ? "text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <Target className="h-4 w-4 shrink-0" />
                    <span>Ventas vs Meta</span>
                  </Link>
                  <Link
                    href="/identified-transactions"
                    onClick={closeMobile}
                    className={`flex items-center space-x-3 px-3 py-2 rounded-md text-sm transition-colors ${
                      isActive("/identified-transactions")
                        ? "text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <UserCheck className="h-4 w-4 shrink-0" />
                    <span>Transacciones Identificadas</span>
                  </Link>
                  <Link
                    href="/top-products"
                    onClick={closeMobile}
                    className={`flex items-center space-x-3 px-3 py-2 rounded-md text-sm transition-colors ${
                      isActive("/top-products")
                        ? "text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <Trophy className="h-4 w-4 shrink-0" />
                    <span>Top 50 Productos</span>
                  </Link>
                </div>
              )}
            </div>

            {/* Tickets */}
            <Link
              href="/tickets"
              onClick={closeMobile}
              className={`flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive("/tickets")
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              <span className="flex items-center space-x-3">
                <Ticket className="h-4 w-4 shrink-0" />
                <span>Tickets</span>
              </span>
              {openTicketCount !== undefined && openTicketCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                  {openTicketCount > 99 ? "99+" : openTicketCount}
                </span>
              )}
            </Link>

            {/* Usuarios — solo system_specialist */}
            {user?.role === "system_specialist" && (
              <Link
                href="/admin/users"
                onClick={closeMobile}
                className={`flex items-center space-x-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive("/admin/users")
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <Users className="h-4 w-4 shrink-0" />
                <span>Usuarios</span>
              </Link>
            )}

            {/* Portal Proveedores — solo system_specialist y commercial_specialist */}
            {(user?.role === "system_specialist" || user?.role === "commercial_specialist") && (
              <Link
                href="/supplier"
                onClick={closeMobile}
                className={`flex items-center space-x-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive("/supplier")
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <Truck className="h-4 w-4 shrink-0" />
                <span>Ventas por Proveedor</span>
              </Link>
            )}

            {/* Administración proveedores — solo system_specialist y commercial_specialist */}
            {(user?.role === "system_specialist" || user?.role === "commercial_specialist") && (
              <Link
                href="/monitoreo-proveedores"
                onClick={closeMobile}
                className={`flex items-center space-x-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive("/monitoreo-proveedores") || isActive("/afiliacion")
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <Activity className="h-4 w-4 shrink-0" />
                <span>Administración de Proveedores</span>
              </Link>
            )}

            {/* Separador */}
            <div className="border-t border-border pt-2 mt-1">
              {/* Info usuario */}
              <div className="flex items-center space-x-3 px-3 py-2 text-sm text-muted-foreground">
                <User className="h-4 w-4 shrink-0" />
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{user?.name}</span>
                  <span className="text-xs">
                    {user?.role === 'system_specialist' ? 'Especialista de Sistemas'
                      : user?.role === 'cst_user' ? 'Usuario CST'
                      : user?.role === 'commercial_specialist' ? 'Especialista Comercial'
                      : user?.role === 'store_user' ? 'Usuario Tienda'
                      : user?.role === 'supplier_user' ? 'Usuario Proveedor'
                      : user?.role === 'own_brand_user' ? 'Usuario Marca Propia'
                      : user?.role}
                  </span>
                </div>
              </div>

              {/* Cerrar Sesión */}
              <button
                onClick={() => { closeMobile(); logout(); }}
                className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-md text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
