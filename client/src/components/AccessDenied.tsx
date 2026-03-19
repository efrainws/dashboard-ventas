import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface AccessDeniedProps {
  message?: string;
}

/**
 * Componente de acceso denegado.
 * Se muestra cuando un usuario intenta acceder a una página no autorizada para su perfil.
 */
export function AccessDenied({ message = "No tienes acceso a esta página." }: AccessDeniedProps) {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6 px-4">
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <ShieldOff className="h-8 w-8 text-destructive" />
        </div>
        <h1
          className="text-2xl font-bold uppercase tracking-wide"
          style={{ fontFamily: "Italian Plate No 1, serif" }}
        >
          Acceso Denegado
        </h1>
        <p className="text-muted-foreground" style={{ fontFamily: "Sailec, sans-serif" }}>
          {message}
        </p>
        <Button
          variant="outline"
          onClick={() => navigate("/")}
          className="mt-2"
        >
          Volver al inicio
        </Button>
      </div>
    </div>
  );
}
