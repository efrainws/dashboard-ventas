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
import SalesVsTarget from "./pages/SalesVsTarget";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ component: Component, path }: { component: React.ComponentType; path: string }) {
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

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        {() => <ProtectedRoute component={Home} path="/" />}
      </Route>
      <Route path="/sales">
        {() => <ProtectedRoute component={SalesByCategory} path="/sales" />}
      </Route>
      <Route path="/hourly">
        {() => <ProtectedRoute component={HourlyAnalysis} path="/hourly" />}
      </Route>
      <Route path="/sales-vs-target">
        {() => <ProtectedRoute component={SalesVsTarget} path="/sales-vs-target" />}
      </Route>
      <Route path="/admin/users">
        {() => <ProtectedRoute component={UserManagement} path="/admin/users" />}
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
            <Router />
          </TooltipProvider>
        </FiltersProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
