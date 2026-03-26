/**
 * TermsPage.tsx
 * Página de términos y condiciones del servicio facturado.
 * El proveedor debe marcar el checkbox y confirmar para cambiar su estado.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, FileText } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function TermsPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [accepted, setAccepted] = useState(false);

  const { data: terms, isLoading: termsLoading } = trpc.supplierTrial.getActiveTerms.useQuery();
  const { data: myStatus } = trpc.supplierTrial.getMyStatus.useQuery(undefined, { enabled: user?.role === "supplier_user" });

  const utils = trpc.useUtils();
  const acceptMutation = trpc.supplierTrial.acceptTerms.useMutation({
    onSuccess: () => {
      utils.supplierTrial.getMyStatus.invalidate();
      toast.success("Términos aceptados. Tu acceso ha sido activado.");
      navigate("/");
    },
    onError: (e) => toast.error(e.message),
  });

  if (termsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#008064" }} />
      </div>
    );
  }

  if (!terms) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">No hay términos activos configurados. Contacta al administrador.</p>
      </div>
    );
  }

  const alreadyAccepted = myStatus?.supplierStatus === "subscribed_active" || myStatus?.supplierStatus === "access_requested";

  return (
    <div className="min-h-screen" style={{ background: "#F5F4F1" }}>
      <div className="container py-10 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex items-center justify-center w-10 h-10 rounded-full" style={{ background: "#008064" }}>
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}>
              Términos del Servicio Facturado
            </h1>
            <p className="text-sm text-muted-foreground">Versión {terms.version}</p>
          </div>
        </div>

        {/* Contenido de los términos */}
        <Card className="mb-6" style={{ border: "1px solid #EAE8E2" }}>
          <CardContent className="pt-6">
            <div
              className="prose prose-sm max-w-none text-sm leading-relaxed"
              style={{ color: "#3D3B3C", whiteSpace: "pre-wrap", maxHeight: "50vh", overflowY: "auto" }}
            >
              {terms.content}
            </div>
          </CardContent>
        </Card>

        {/* Aceptación */}
        {alreadyAccepted ? (
          <div className="flex items-center gap-3 p-4 rounded-lg" style={{ background: "#DCFCE7", border: "1px solid #86EFAC" }}>
            <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: "#008064" }} />
            <p className="text-sm font-medium" style={{ color: "#004032" }}>
              Ya has aceptado estos términos. Tu acceso está activo.
            </p>
          </div>
        ) : (
          <Card style={{ border: "1px solid #EAE8E2" }}>
            <CardHeader>
              <CardTitle className="text-base">Confirmación de aceptación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="accept-terms"
                  checked={accepted}
                  onCheckedChange={(v) => setAccepted(!!v)}
                  className="mt-0.5"
                />
                <label htmlFor="accept-terms" className="text-sm leading-relaxed cursor-pointer">
                  He leído y acepto los <strong>Términos del Servicio Facturado</strong> de Flora &amp; Fauna (versión {terms.version}).
                  Entiendo que al aceptar, mi acceso pasará a ser un servicio sujeto a facturación mensual.
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => navigate("/")}
                  className="flex-1"
                >
                  Volver
                </Button>
                <Button
                  disabled={!accepted || acceptMutation.isPending}
                  onClick={() => acceptMutation.mutate({ termsVersionId: terms.id })}
                  className="flex-1"
                  style={{ background: "#008064", color: "#fff" }}
                >
                  {acceptMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Procesando...</>
                  ) : (
                    "Aceptar y activar acceso"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
