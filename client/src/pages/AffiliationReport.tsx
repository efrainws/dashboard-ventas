/**
 * AffiliationReport.tsx
 * Reporte de afiliación de proveedores con exportación CSV.
 * Solo accesible para system_specialist y commercial_specialist.
 */
import { useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Download, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useLocation } from "wouter";

type SupplierStatus = "trial_active" | "trial_expired" | "subscribed_active" | "access_requested" | "suspended";

const STATUS_LABELS: Record<string, string> = {
  pending_activation: "Pendiente de activación",
  trial_active: "Trial activo",
  trial_expired: "Trial vencido",
  subscribed_active: "Suscrito activo",
  access_requested: "Solicitud pendiente",
  suspended: "Suspendido",
};

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return format(new Date(d), "dd/MM/yyyy", { locale: es });
}

function fmtPct(p: number | null): string {
  if (p === null) return "";
  return `${Math.round(p * 100)}%`;
}

function exportCSV(data: any[]) {
  const headers = [
    "ID",
    "Nombre",
    "Email",
    "RUC Proveedor",
    "Nombre Proveedor",
    "Estado efectivo",
    "Fecha activación",
    "Fecha inicio suscripción",
    "Primer mes",
    "% cobro proporcional",
  ];

  const rows = data.map((r) => [
    r.id,
    r.name ?? "",
    r.email ?? "",
    r.supplierRuc ?? r.assignedSupplierId ?? "",
    r.supplierName ?? "",
    STATUS_LABELS[r.effectiveStatus ?? ""] ?? r.effectiveStatus ?? "",
    fmtDate(r.activationDate),
    fmtDate(r.subscriptionStartDate),
    r.primerMes ? "Sí" : "No",
    fmtPct(r.porcentajeCobro),
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `reporte_afiliacion_${format(new Date(), "yyyyMMdd")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AffiliationReport() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: report, isLoading } = trpc.supplierTrial.getAffiliationReport.useQuery();

  if (!user || (user.role !== "system_specialist" && user.role !== "commercial_specialist")) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">No tienes permisos para acceder a esta página.</p>
      </div>
    );
  }

  // Totales
  const totalSubscribed = report?.filter((r) => r.effectiveStatus === "subscribed_active").length ?? 0;
  const totalTrial = report?.filter((r) => r.effectiveStatus === "trial_active").length ?? 0;
  const totalPending = report?.filter((r) => r.effectiveStatus === "access_requested").length ?? 0;
  const totalFirstMonth = report?.filter((r) => r.primerMes).length ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/monitoreo-proveedores")}
              className="text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Volver
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}>
                Reporte de Afiliación
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {format(new Date(), "MMMM yyyy", { locale: es })} · {report?.length ?? 0} proveedores
              </p>
            </div>
          </div>
          <Button
            onClick={() => report && exportCSV(report)}
            disabled={!report || isLoading}
            style={{ background: "#008064", color: "#fff" }}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Suscritos activos", value: totalSubscribed, color: "#008064" },
            { label: "En trial", value: totalTrial, color: "#6366F1" },
            { label: "Solicitudes pendientes", value: totalPending, color: "#D97706" },
            { label: "Primer mes (prorrateado)", value: totalFirstMonth, color: "#0891B2" },
          ].map((kpi) => (
            <div
              key={kpi.label}
            className="rounded-lg p-4 bg-card border border-border"
            >
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{kpi.label}</p>
              <p className="text-3xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Tabla */}
        <div className="rounded-lg overflow-hidden border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold">Nombre</TableHead>
                <TableHead className="text-xs font-semibold">Email</TableHead>
                <TableHead className="text-xs font-semibold">Proveedor</TableHead>
                <TableHead className="text-xs font-semibold">Estado</TableHead>
                <TableHead className="text-xs font-semibold">Activación</TableHead>
                <TableHead className="text-xs font-semibold">Inicio suscripción</TableHead>
                <TableHead className="text-xs font-semibold text-center">Primer mes</TableHead>
                <TableHead className="text-xs font-semibold text-right">% Cobro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" style={{ color: "#008064" }} />
                  </TableCell>
                </TableRow>
              ) : !report?.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                    No hay usuarios proveedor registrados.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {report.map((r) => (
                    <TableRow key={r.id} className="hover:bg-muted/30">
                      <TableCell className="text-sm">{r.name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.email ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {r.supplierRuc && r.supplierName
                          ? <span><span className="font-mono text-xs text-muted-foreground">{r.supplierRuc}</span> — {r.supplierName}</span>
                          : <span className="text-muted-foreground text-xs">{r.assignedSupplierId ?? "—"}</span>
                        }
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {STATUS_LABELS[r.effectiveStatus ?? ""] ?? r.effectiveStatus ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtDate(r.activationDate)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtDate(r.subscriptionStartDate)}</TableCell>
                      <TableCell className="text-center">
                        {r.primerMes ? (
                          <span className="text-xs font-medium" style={{ color: "#008064" }}>Sí</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">No</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {r.porcentajeCobro !== null ? (
                          <span style={{ color: r.primerMes ? "#008064" : "#3D3B3C" }}>
                            {fmtPct(r.porcentajeCobro)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Fila de totales */}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={6} className="text-sm font-semibold">Total General</TableCell>
                    <TableCell className="text-center text-sm font-semibold">{totalFirstMonth}</TableCell>
                    <TableCell className="text-right text-sm font-semibold">
                      {report.filter((r) => r.porcentajeCobro !== null).length > 0
                        ? fmtPct(
                            report.reduce((acc, r) => acc + (r.porcentajeCobro ?? 0), 0) /
                            report.filter((r) => r.porcentajeCobro !== null).length
                          )
                        : "—"}
                    </TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Nota */}
        <p className="text-xs text-muted-foreground">
          * El porcentaje de cobro proporcional aplica únicamente al primer mes de suscripción y se calcula como los días restantes del mes desde la fecha de inicio de suscripción sobre el total de días del mes.
        </p>
      </div>
    </div>
  );
}
