import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { FiltersProvider } from "./contexts/FiltersContext";
import { useAuth } from "./_core/hooks/useAuth";
import Home from "./pages/Home";
import SalesByCategory from "./pages/SalesByCategory";
import HourlyAnalysis from "./pages/HourlyAnalysis";
import UserManagement from "./pages/UserManagement";
import Login from "./pages/Login";
import ActivateAccount from "./pages/ActivateAccount";
import SalesVsTarget from "./pages/SalesVsTarget";
import DiscrepancyTickets from "./pages/DiscrepancyTickets";
import IdentifiedTransactions from "./pages/IdentifiedTransactions";
import SupplierHome from "./pages/SupplierHome";
import TopProducts from "./pages/TopProducts";
import SupplierPortal from "./pages/SupplierPortal";
import { AccessDenied } from "./components/AccessDenied";
import { Loader2 } from "lucide-react";
import TermsPage from "./pages/TermsPage";
import AccessExpiredPage from "./pages/AccessExpiredPage";
import SupplierMonitor from "./pages/SupplierMonitor";
import AffiliationReport from "./pages/AffiliationReport";
import { TrialPopup } from "./components/TrialPopup";

type RouteGuard = "no_supplier" | "managers_only";

/**
 * Ruta protegida con autenticación y control de acceso por perfil.
 *
 * guard="no_supplier" → bloquea a supplier_user (páginas generales del sistema)
 * guard="managers_only" → solo system_specialist, cst_user, commercial_specialist
 */
function ProtectedRoute({
  component: Component,
  path,
  guard,
}: {
  component: React.ComponentType;
  path: string;
  guard?: RouteGuard;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-lg font-medium">Verificando autenticación...</span>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  // supplier_user → redirigir siempre a su portal exclusivo (excepto si ya está en /supplier)
  if (user.role === "supplier_user" && path !== "/supplier") {
    return <Redirect to="/supplier" />;
  }

  // Guard: bloquear supplier_user en páginas generales
  if (guard === "no_supplier" && user.role === "supplier_user") {
    return <AccessDenied />;
  }

  // Guard: solo roles gestores pueden acceder
  if (
    guard === "managers_only" &&
    user.role !== "system_specialist" &&
    user.role !== "cst_user" &&
    user.role !== "commercial_specialist"
  ) {
    return <AccessDenied />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/activate/:token" component={ActivateAccount} />

      {/* Portal exclusivo para proveedores */}
      <Route path="/supplier">
        {() => <ProtectedRoute component={SupplierPortal} path="/supplier" />}
      </Route>

      {/* Términos del servicio — accesible para proveedores */}
      <Route path="/terminos">
        {() => <ProtectedRoute component={TermsPage} path="/terminos" />}
      </Route>

      {/* Acceso vencido — accesible para proveedores */}
      <Route path="/acceso-vencido">
        {() => <ProtectedRoute component={AccessExpiredPage} path="/acceso-vencido" />}
      </Route>

      {/* Monitoreo de proveedores — solo especialistas */}
      <Route path="/monitoreo-proveedores">
        {() => <ProtectedRoute component={SupplierMonitor} path="/monitoreo-proveedores" guard="managers_only" />}
      </Route>

      {/* Reporte de afiliación — solo especialistas */}
      <Route path="/afiliacion">
        {() => <ProtectedRoute component={AffiliationReport} path="/afiliacion" guard="managers_only" />}
      </Route>

      {/* Páginas generales — bloqueadas para supplier_user */}
      <Route path="/">
        {() => <ProtectedRoute component={Home} path="/" guard="no_supplier" />}
      </Route>
      <Route path="/sales">
        {() => <ProtectedRoute component={SalesByCategory} path="/sales" guard="no_supplier" />}
      </Route>
      <Route path="/hourly">
        {() => <ProtectedRoute component={HourlyAnalysis} path="/hourly" guard="no_supplier" />}
      </Route>
      <Route path="/sales-vs-target">
        {() => <ProtectedRoute component={SalesVsTarget} path="/sales-vs-target" guard="no_supplier" />}
      </Route>
      <Route path="/tickets">
        {() => <ProtectedRoute component={DiscrepancyTickets} path="/tickets" guard="no_supplier" />}
      </Route>
      <Route path="/identified-transactions">
        {() => (
          <ProtectedRoute
            component={IdentifiedTransactions}
            path="/identified-transactions"
            guard="no_supplier"
          />
        )}
      </Route>
      <Route path="/top-products">
        {() => <ProtectedRoute component={TopProducts} path="/top-products" guard="no_supplier" />}
      </Route>

      {/* Gestión de usuarios — solo gestores */}
      <Route path="/admin/users">
        {() => <ProtectedRoute component={UserManagement} path="/admin/users" guard="managers_only" />}
      </Route>

      <Route path="/404" component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system" switchable={true}>
        <FiltersProvider>
          <TooltipProvider>
            <Toaster />
            <TrialPopup />
            <Router />
          </TooltipProvider>
        </FiltersProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
