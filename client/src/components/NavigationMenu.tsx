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
import { LogOut, User, ChevronDown, Home, BarChart3, Clock, Target, Ticket, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";

export function NavigationMenu() {
  const [location] = useLocation();
  const { user, logout, isAuthenticated } = useAuth();
  const { effectiveTheme } = useTheme();
  const { data: openTicketCount } = trpc.tickets.countOpen.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
    refetchInterval: 60_000, // refresh every minute
  });
  
  // Logo según tema
  const logoSrc = effectiveTheme === "dark" ? "/Logoclarochico.svg" : "/Logonegro.svg";

  if (!isAuthenticated) {
    return (
      <nav className="border-b bg-background">
        <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center space-x-2">
          <img 
            src={logoSrc}
            alt="Flora & Fauna" 
            className="h-6 w-auto" 
          />
        </Link>
          <Button asChild>
            <a href={getLoginUrl()}>Iniciar Sesión</a>
          </Button>
        </div>
      </nav>
    );
  }

  const isActive = (path: string) => location === path;

  return (
    <nav className="border-b bg-background sticky top-0 z-50">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center space-x-2">
          <img 
            src={logoSrc}
            alt="Flora & Fauna" 
            className="h-6 w-auto" 
          />
        </Link>

        {/* Navigation Links */}
        <div className="flex items-center space-x-6">
          <Link
            href="/"
            className={`flex items-center space-x-1 text-sm font-medium transition-colors hover:text-primary ${
              isActive("/") ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Home className="h-4 w-4" />
            <span>Inicio</span>
          </Link>

          {/* Dropdown Menu for Ventas */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={`flex items-center space-x-1 text-sm font-medium ${
                  location.startsWith("/sales") || location.startsWith("/hourly") || location.startsWith("/sales-vs-target")
                    ? "text-primary"
                    : "text-muted-foreground"
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
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Tickets link */}
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

          {/* Users link — admin only */}
          {user?.role === "admin" && (
            <Link
              href="/users"
              className={`flex items-center space-x-1 text-sm font-medium transition-colors hover:text-primary ${
                isActive("/users") ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Users className="h-4 w-4" />
              <span>Usuarios</span>
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
                  <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
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
      </div>
    </nav>
  );
}
