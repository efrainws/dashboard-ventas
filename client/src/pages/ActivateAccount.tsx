import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  User,
} from "lucide-react";

// ─── Password strength helper ─────────────────────────────────────────────────

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
  if (score === 4) return { score, label: "Fuerte", color: "#5C6B3A" };
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
  const [activatedUsername, setActivatedUsername] = useState("");

  // ── Activation mutation ──
  const activateMutation = trpc.activation.activateAccount.useMutation({
    onSuccess: (data) => {
      setActivatedUsername(data.username ?? "");
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

    activateMutation.mutate({ token, temporaryPassword, newPassword, confirmPassword });
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
            <span className="font-mono font-semibold text-foreground">{activatedUsername}</span>
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
          Hola, <strong className="text-foreground">{tokenData.username}</strong>. Para activar tu cuenta
          ingresa la contraseña temporal que recibiste y elige una nueva contraseña segura.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Username (read-only) */}
        <div className="space-y-1.5">
          <Label className="font-body text-xs uppercase tracking-wider text-muted-foreground">
            Nombre de usuario
          </Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={tokenData.username}
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
            <p className="text-xs font-body" style={{ color: "#5C6B3A" }}>
              ✓ Las contraseñas coinciden
            </p>
          )}
        </div>

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
          disabled={activateMutation.isPending}
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
          className="h-7 w-auto"
          style={{ filter: "var(--logo-filter, none)" }}
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

      {/* Footer */}
      <p className="mt-8 text-xs text-muted-foreground font-body">
        © {new Date().getFullYear()} Flora &amp; Fauna · Dashboard de Ventas
      </p>
    </div>
  );
}
