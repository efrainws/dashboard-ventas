import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  User,
  FileText,
  X,
} from "lucide-react";

// ─── Password strength helper ─────────────────────────────────────────────────
// v2 - fix: useRef for termsAccepted stale closure (2026-03-27)

function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  if (!password) return { score: 0, label: "", color: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: "Muy débil", color: "#E05252" };
  if (score === 2) return { score, label: "Débil", color: "#E08C52" };
  if (score === 3) return { score, label: "Aceptable", color: "#D4B84A" };
  if (score === 4) return { score, label: "Fuerte", color: "var(--muted-foreground)" };
  return { score, label: "Muy fuerte", color: "#3A6B4A" };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ActivateAccount() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";
  const [, setLocation] = useLocation();

  // ── Token validation state ──
  const {
    data: tokenData,
    isLoading: validatingToken,
    error: tokenError,
  } = trpc.activation.validateToken.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  // ── Form state ──
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showTempPass, setShowTempPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [formError, setFormError] = useState("");
  const [activated, setActivated] = useState(false);
  const [activatedEmail, setActivatedEmail] = useState("");

  // ── T&C state (only for subscribed_active) ──
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsDialogOpen, setTermsDialogOpen] = useState(false);
  // Ref to always read the latest termsAccepted value inside handleSubmit (avoids stale closure)
  const termsAcceptedRef = useRef(false);

  // Determine if this user needs to accept T&C during activation
  const requiresTerms =
    tokenData?.role === "supplier_user" &&
    tokenData?.supplierStatus === "subscribed_active";

  // ── Activation mutation ──
  const activateMutation = trpc.activation.activateAccount.useMutation({
    onSuccess: (data) => {
      setActivatedEmail(data.email ?? "");
      setActivated(true);
    },
    onError: (error) => {
      setFormError(error.message);
    },
  });

  const passwordStrength = getPasswordStrength(newPassword);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!temporaryPassword.trim()) {
      setFormError("Ingresa tu contraseña temporal");
      return;
    }
    if (newPassword.length < 8) {
      setFormError("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError("Las contraseñas no coinciden");
      return;
    }
    if (requiresTerms && !termsAcceptedRef.current) {
      setFormError("Debes aceptar los términos y condiciones para activar tu cuenta");
      return;
    }

    activateMutation.mutate({
      token,
      temporaryPassword,
      newPassword,
      confirmPassword,
      ...(requiresTerms && tokenData?.activeTermsVersionId
        ? { termsVersionId: tokenData.activeTermsVersionId, termsAccepted: true }
        : {}),
    });
  };

  // ── Redirect to login after activation ──
  useEffect(() => {
    if (activated) {
      const timer = setTimeout(() => setLocation("/login"), 4000);
      return () => clearTimeout(timer);
    }
  }, [activated, setLocation]);

  // ─── Render: loading token validation ──────────────────────────────────────
  if (validatingToken) {
    return (
      <ActivationShell>
        <div className="flex flex-col items-center gap-4 py-8">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground font-body">Verificando enlace de activación...</p>
        </div>
      </ActivationShell>
    );
  }

  // ─── Render: invalid / expired token ───────────────────────────────────────
  if (tokenError || !tokenData?.valid) {
    return (
      <ActivationShell>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-bold text-foreground font-heading uppercase tracking-wide">
            Enlace no válido
          </h2>
          <p className="text-muted-foreground font-body max-w-sm leading-relaxed">
            {tokenError?.message ?? "Este enlace de activación no es válido o ha expirado."}
          </p>
          <p className="text-sm text-muted-foreground font-body">
            Contacta al administrador del sistema para obtener un nuevo enlace.
          </p>
          <Button
            variant="outline"
            onClick={() => setLocation("/login")}
            className="mt-2"
          >
            Ir al inicio de sesión
          </Button>
        </div>
      </ActivationShell>
    );
  }

  // ─── Render: activation success ────────────────────────────────────────────
  if (activated) {
    return (
      <ActivationShell>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#EEF1E6]">
            <CheckCircle2 className="h-8 w-8 text-[#5C6B3A]" />
          </div>
          <h2 className="text-xl font-bold text-foreground font-heading uppercase tracking-wide">
            ¡Cuenta activada!
          </h2>
          <p className="text-muted-foreground font-body max-w-sm leading-relaxed">
            Tu contraseña ha sido establecida correctamente. Serás redirigido al inicio de sesión en unos segundos.
          </p>
          <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-body">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono font-semibold text-foreground">{activatedEmail}</span>
          </div>
          <Button onClick={() => setLocation("/login")} className="mt-2">
            Iniciar sesión ahora
          </Button>
        </div>
      </ActivationShell>
    );
  }

  // ─── Render: activation form ────────────────────────────────────────────────
  return (
    <ActivationShell>
      {/* Intro */}
      <div className="mb-6">
        <p className="text-sm text-muted-foreground font-body leading-relaxed">
          Hola, <strong className="text-foreground">{tokenData.email}</strong>. Para activar tu cuenta
          ingresa la contraseña temporal que recibiste y elige una nueva contraseña segura.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Email (read-only) */}
        <div className="space-y-1.5">
          <Label className="font-body text-xs uppercase tracking-wider text-muted-foreground">
            Correo electrónico
          </Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={tokenData.email}
              readOnly
              className="pl-9 bg-muted/50 font-mono text-sm cursor-not-allowed"
            />
          </div>
        </div>

        {/* Temporary password */}
        <div className="space-y-1.5">
          <Label htmlFor="tempPass" className="font-body text-xs uppercase tracking-wider text-muted-foreground">
            Contraseña temporal
          </Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="tempPass"
              type={showTempPass ? "text" : "password"}
              placeholder="Ingresa la contraseña temporal"
              value={temporaryPassword}
              onChange={(e) => setTemporaryPassword(e.target.value)}
              className="pl-9 pr-10 font-body"
              disabled={activateMutation.isPending}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowTempPass(!showTempPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showTempPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-card px-3 text-xs text-muted-foreground font-body uppercase tracking-wider">
              Nueva contraseña
            </span>
          </div>
        </div>

        {/* New password */}
        <div className="space-y-1.5">
          <Label htmlFor="newPass" className="font-body text-xs uppercase tracking-wider text-muted-foreground">
            Nueva contraseña
          </Label>
          <div className="relative">
            <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="newPass"
              type={showNewPass ? "text" : "password"}
              placeholder="Mínimo 8 caracteres"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-9 pr-10 font-body"
              disabled={activateMutation.isPending}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowNewPass(!showNewPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {/* Password strength bar */}
          {newPassword && (
            <div className="space-y-1 pt-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-1 flex-1 rounded-full transition-all duration-300"
                    style={{
                      backgroundColor:
                        i <= passwordStrength.score ? passwordStrength.color : "#E5E2DB",
                    }}
                  />
                ))}
              </div>
              <p
                className="text-xs font-body"
                style={{ color: passwordStrength.color }}
              >
                {passwordStrength.label}
              </p>
            </div>
          )}
        </div>

        {/* Confirm password */}
        <div className="space-y-1.5">
          <Label htmlFor="confirmPass" className="font-body text-xs uppercase tracking-wider text-muted-foreground">
            Confirmar nueva contraseña
          </Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="confirmPass"
              type={showConfirmPass ? "text" : "password"}
              placeholder="Repite la nueva contraseña"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={`pl-9 pr-10 font-body ${
                confirmPassword && confirmPassword !== newPassword
                  ? "border-destructive focus-visible:ring-destructive"
                  : confirmPassword && confirmPassword === newPassword
                  ? "border-[#5C6B3A] focus-visible:ring-[#5C6B3A]"
                  : ""
              }`}
              disabled={activateMutation.isPending}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPass(!showConfirmPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showConfirmPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {confirmPassword && confirmPassword !== newPassword && (
            <p className="text-xs text-destructive font-body">Las contraseñas no coinciden</p>
          )}
          {confirmPassword && confirmPassword === newPassword && (
            <p className="text-xs font-body" style={{ color: "var(--muted-foreground)" }}>
              ✓ Las contraseñas coinciden
            </p>
          )}
        </div>

        {/* ── Términos y condiciones (solo para subscribed_active) ── */}
        {requiresTerms && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-3 text-xs text-muted-foreground font-body uppercase tracking-wider">
                  Términos y condiciones
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              {/* Botón para ver T&C */}
              <button
                type="button"
                onClick={() => setTermsDialogOpen(true)}
                className="flex items-center gap-2 text-sm font-body text-primary hover:underline underline-offset-2 transition-colors"
              >
                <FileText className="h-4 w-4 shrink-0" />
                <span>
                  Ver Términos y Condiciones
                  {tokenData.activeTermsVersion && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      (v{tokenData.activeTermsVersion})
                    </span>
                  )}
                </span>
              </button>

              {/* Checkbox obligatorio */}
              <div className="flex items-start gap-3">
                <Checkbox
                  id="termsCheck"
                  checked={termsAccepted}
                  onCheckedChange={(checked) => {
                    const val = checked === true;
                    termsAcceptedRef.current = val;
                    setTermsAccepted(val);
                    // Clear any prior T&C error when user checks the box
                    if (val) setFormError("");
                  }}
                  disabled={activateMutation.isPending}
                  className="mt-0.5 shrink-0"
                />
                <Label
                  htmlFor="termsCheck"
                  className="text-sm font-body leading-relaxed text-foreground cursor-pointer"
                >
                  Declaro que he leído los términos y condiciones en su totalidad y estoy de acuerdo con ellos
                </Label>
              </div>

              {!termsAccepted && (
                <p className="text-xs text-muted-foreground font-body">
                  Debes aceptar los términos y condiciones para poder activar tu cuenta.
                </p>
              )}
            </div>
          </>
        )}

        {/* Error message */}
        {formError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-sm text-destructive font-body">{formError}</p>
          </div>
        )}

        {/* Submit */}
        <Button
          type="submit"
          className="w-full font-body uppercase tracking-wider"
          disabled={activateMutation.isPending || (requiresTerms && !termsAccepted)}
          size="lg"
        >
          {activateMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Activando cuenta...
            </>
          ) : (
            "Activar cuenta"
          )}
        </Button>
      </form>

      {/* Expiry notice */}
      {tokenData.expiresAt && (
        <p className="mt-4 text-center text-xs text-muted-foreground font-body">
          Este enlace expira el{" "}
          {new Date(tokenData.expiresAt).toLocaleString("es-PE", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}

      {/* ── Popup de Términos y Condiciones ── */}
      <Dialog open={termsDialogOpen} onOpenChange={setTermsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="font-heading uppercase tracking-wide text-lg">
                Términos y Condiciones
                {tokenData.activeTermsVersion && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground normal-case tracking-normal">
                    v{tokenData.activeTermsVersion}
                  </span>
                )}
              </DialogTitle>
            </div>
          </DialogHeader>

          {/* Contenido scrollable */}
          <div className="flex-1 overflow-y-auto pr-1">
            {tokenData.activeTermsContent ? (
              <div
                className="prose prose-sm dark:prose-invert max-w-none font-body text-sm leading-relaxed text-foreground"
                dangerouslySetInnerHTML={{ __html: tokenData.activeTermsContent }}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <FileText className="h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground font-body text-sm">
                  Los términos y condiciones no están disponibles en este momento.
                  Contacta al administrador.
                </p>
              </div>
            )}
          </div>

          {/* Footer del popup */}
          <div className="flex-shrink-0 pt-4 border-t border-border flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => setTermsDialogOpen(false)}
            >
              Cerrar
            </Button>
            <Button
              onClick={() => {
                setTermsAccepted(true);
                setTermsDialogOpen(false);
              }}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              He leído y acepto
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ActivationShell>
  );
}

// ─── Shell layout (logo + card) ───────────────────────────────────────────────

function ActivationShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ backgroundColor: "var(--background)" }}
    >
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <img
          src="/Logonegro.svg"
          alt="Flora & Fauna"
          className="h-7 w-auto block dark:hidden"
        />
        <img
          src="/Logoclarochico.svg"
          alt="Flora & Fauna"
          className="h-7 w-auto hidden dark:block"
        />
        <p
          className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-body"
        >
          Dashboard de Ventas
        </p>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card shadow-sm"
        style={{ padding: "2rem" }}
      >
        {/* Card header */}
        <div className="mb-6 border-b border-border pb-5">
          <h1
            className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground"
          >
            Activar cuenta
          </h1>
          <p className="mt-1 text-sm text-muted-foreground font-body">
            Establece tu contraseña para acceder al dashboard
          </p>
        </div>

        {children}
      </div>
    </div>
  );
}
