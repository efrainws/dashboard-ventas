/**
 * TrialPopup.tsx
 * Popup que se muestra una vez por día calendario al proveedor durante el trial.
 * Informa sobre los días restantes y ofrece acceso a los términos.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { useLocation } from "wouter";

const STORAGE_KEY = "trial_popup_last_shown";

function shouldShowToday(): boolean {
  const last = localStorage.getItem(STORAGE_KEY);
  if (!last) return true;
  const lastDate = new Date(last);
  const today = new Date();
  return (
    lastDate.getFullYear() !== today.getFullYear() ||
    lastDate.getMonth() !== today.getMonth() ||
    lastDate.getDate() !== today.getDate()
  );
}

function markShownToday(): void {
  localStorage.setItem(STORAGE_KEY, new Date().toISOString());
}

export function TrialPopup() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isSupplier = user?.role === "supplier_user";
  const { data: status } = trpc.supplierTrial.getMyStatus.useQuery(undefined, {
    retry: false,
    enabled: isSupplier,
  });

  useEffect(() => {
    if (!status) return;
    if (status.supplierStatus !== "trial_active") return;
    if (!shouldShowToday()) return;
    setOpen(true);
    markShownToday();
  }, [status]);

  if (!status || status.supplierStatus !== "trial_active") return null;

  const trialEnd = status.trialEndDate ? new Date(status.trialEndDate) : null;
  const daysLeft = trialEnd ? Math.max(0, differenceInDays(trialEnd, new Date())) : null;
  const endDateStr = trialEnd
    ? format(trialEnd, "d 'de' MMMM 'de' yyyy", { locale: es })
    : "—";

  const isUrgent = daysLeft !== null && daysLeft <= 2;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div
              className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
              style={{ background: isUrgent ? "#FEF3C7" : "#DCFCE7" }}
            >
              {isUrgent ? (
                <AlertTriangle className="h-5 w-5" style={{ color: "#D97706" }} />
              ) : (
                <Clock className="h-5 w-5" style={{ color: "#008064" }} />
              )}
            </div>
            <DialogTitle className="text-base font-bold leading-tight">
              {isUrgent
                ? `Tu período de prueba vence en ${daysLeft} día${daysLeft === 1 ? "" : "s"}`
                : "Período de prueba activo"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
            {daysLeft !== null ? (
              <>
                Tienes acceso de prueba hasta el <strong>{endDateStr}</strong>.{" "}
                {daysLeft > 0
                  ? `Te quedan ${daysLeft} día${daysLeft === 1 ? "" : "s"} de acceso gratuito.`
                  : "Tu acceso de prueba vence hoy."}
              </>
            ) : (
              "Tu acceso de prueba está activo."
            )}
          </DialogDescription>
        </DialogHeader>

        <div
          className="rounded-lg p-3 text-sm mb-4"
          style={{ background: "var(--background)", border: "1px solid #EAE8E2" }}
        >
          <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
            Restricciones durante el trial
          </p>
          <ul className="space-y-1 text-muted-foreground">
            <li>• Solo exportación CSV disponible</li>
            <li>• Consultas limitadas a un rango máximo de 1 mes</li>
            <li>• Datos con antigüedad máxima de 2 meses</li>
          </ul>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setOpen(false)}
          >
            Continuar
          </Button>
          <Button
            className="flex-1"
            style={{ background: "#008064", color: "#fff" }}
            onClick={() => {
              setOpen(false);
              navigate("/terminos");
            }}
          >
            Ver términos del servicio
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
