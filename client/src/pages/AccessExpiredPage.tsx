/**
 * AccessExpiredPage.tsx
 * Página independiente que se muestra cuando el trial del proveedor ha vencido.
 * Permite solicitar acceso al servicio facturado aceptando los términos.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Lock, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";

export default function AccessExpiredPage() {
  const [accepted, setAccepted] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { data: terms, isLoading: termsLoading } = trpc.supplierTrial.getActiveTerms.useQuery();
  const { data: myStatus } = trpc.supplierTrial.getMyStatus.useQuery();

  const utils = trpc.useUtils();
  const requestMutation = trpc.supplierTrial.requestPaidAccess.useMutation({
    onSuccess: () => {
      utils.supplierTrial.getMyStatus.invalidate();
      setSubmitted(true);
    },
    onError: (e) => toast.error(e.message),
  });

  // Si ya tiene solicitud pendiente o está activo, mostrar estado correspondiente
  const isRequested = myStatus?.supplierStatus === "access_requested";
  const isActive = myStatus?.supplierStatus === "subscribed_active";

  if (isActive) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F5F4F1" }}>
        <div className="text-center space-y-4 max-w-md px-6">
          <CheckCircle2 className="h-16 w-16 mx-auto" style={{ color: "#008064" }} />
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}>
            Acceso activado
          </h1>
          <p className="text-muted-foreground">Tu acceso al servicio facturado está activo. Ya puedes usar el portal.</p>
          <Button style={{ background: "#008064", color: "#fff" }} onClick={() => window.location.href = "/"}>
            Ir al portal
          </Button>
        </div>
      </div>
    );
  }

  if (isRequested || submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F5F4F1" }}>
        <div className="text-center space-y-4 max-w-md px-6">
          <Clock className="h-16 w-16 mx-auto" style={{ color: "#008064" }} />
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}>
            Solicitud enviada
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Tu solicitud de acceso al servicio facturado ha sido registrada. Un especialista revisará tu solicitud y recibirás una notificación cuando sea aprobada.
          </p>
          <div className="rounded-lg p-4 text-sm" style={{ background: "#DCFCE7", border: "1px solid #86EFAC" }}>
            <p style={{ color: "#004032" }}>Solicitud en revisión — te notificaremos por correo electrónico.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#F5F4F1" }}>
      <div className="w-full max-w-lg px-6 py-10 space-y-8">

        {/* Encabezado */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center w-16 h-16 rounded-full mx-auto" style={{ background: "#FEE2E2" }}>
            <Lock className="h-8 w-8" style={{ color: "#DC2626" }} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}>
            Tu período de prueba ha vencido
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Tu acceso de prueba al Portal de Proveedores de Flora &amp; Fauna ha expirado.
            Para continuar accediendo, solicita el servicio facturado.
          </p>
        </div>

        {/* Términos */}
        {termsLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#008064" }} />
          </div>
        ) : terms ? (
          <div className="space-y-4">
            <div
              className="rounded-lg p-4 text-sm leading-relaxed overflow-y-auto"
              style={{
                background: "#fff",
                border: "1px solid #EAE8E2",
                maxHeight: "280px",
                color: "#3D3B3C",
                whiteSpace: "pre-wrap",
              }}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Términos del Servicio Facturado — v{terms.version}
              </p>
              {terms.content}
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="accept-expired"
                checked={accepted}
                onCheckedChange={(v) => setAccepted(!!v)}
                className="mt-0.5"
              />
              <label htmlFor="accept-expired" className="text-sm leading-relaxed cursor-pointer">
                He leído y acepto los <strong>Términos del Servicio Facturado</strong> de Flora &amp; Fauna (v{terms.version}).
              </label>
            </div>

            <Button
              className="w-full"
              disabled={!accepted || requestMutation.isPending}
              onClick={() => requestMutation.mutate({ termsVersionId: terms.id })}
              style={{ background: "#008064", color: "#fff" }}
            >
              {requestMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Enviando solicitud...</>
              ) : (
                "Solicitar acceso al servicio facturado"
              )}
            </Button>
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            No hay términos configurados. Contacta al administrador.
          </p>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          ¿Tienes dudas? Escríbenos a{" "}
          <a href="mailto:soporte@florayfauna.pe" className="underline" style={{ color: "#008064" }}>
            soporte@florayfauna.pe
          </a>
        </p>
      </div>
    </div>
  );
}
