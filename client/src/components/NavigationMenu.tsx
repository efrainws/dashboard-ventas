import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
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
import { LogOut, User, ChevronDown, Home, BarChart3, Clock, Target } from "lucide-react";
import { getLoginUrl } from "@/const";

export function NavigationMenu() {
  const [location] = useLocation();
  const { user, logout, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <nav className="border-b bg-background">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/">
            <a className="flex items-center space-x-2">
              <span className="text-2xl font-bold" style={{ fontFamily: 'Italian Plate No 1, serif' }}>
                FLORA & FAUNA
              </span>
            </a>
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
        <Link href="/">
          <a className="flex items-center space-x-2">
            <span className="text-2xl font-bold" style={{ fontFamily: 'Italian Plate No 1, serif' }}>
              FLORA & FAUNA
            </span>
          </a>
        </Link>

        {/* Navigation Links */}
        <div className="flex items-center space-x-6">
          <Link href="/">
            <a
              className={`flex items-center space-x-1 text-sm font-medium transition-colors hover:text-primary ${
                isActive("/") ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Home className="h-4 w-4" />
              <span>Inicio</span>
            </a>
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
                  <Link href="/sales">
                    <a className="flex items-center w-full cursor-pointer">
                      <BarChart3 className="mr-2 h-4 w-4" />
                      <span>Análisis por Categorías</span>
                    </a>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/hourly">
                    <a className="flex items-center w-full cursor-pointer">
                      <Clock className="mr-2 h-4 w-4" />
                      <span>Análisis por Horas</span>
                    </a>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/sales-vs-target">
                    <a className="flex items-center w-full cursor-pointer">
                      <Target className="mr-2 h-4 w-4" />
                      <span>Ventas vs Meta</span>
                    </a>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

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
