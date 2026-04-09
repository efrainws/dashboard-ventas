import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Eye, EyeOff } from 'lucide-react';

// ─── Colores del sistema Flora & Fauna ───────────────────────────────────────
const GRAPHITE   = '#232523'; // panel izquierdo + botón
const BONE       = '#F5F4F1'; // fondo panel derecho
const PEBBLE     = '#EAE8E2'; // fondo inputs
const STONE      = '#919291'; // texto secundario / labels
const PARCHMENT  = '#EAE8E2'; // texto tienda en panel izquierdo

export default function Login() {
  const [username, setUsername]      = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]           = useState('');

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      setError('');
      window.location.href = '/';
    },
    onError: (err) => {
      setError(err.message || 'Credenciales incorrectas. Intenta nuevamente.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('Por favor ingresa usuario y contraseña.');
      return;
    }
    loginMutation.mutate({ username, password });
  };

  return (
    <div
      className="min-h-screen flex"
      style={{ backgroundColor: BONE, fontFamily: 'Sailec, sans-serif' }}
    >
      {/* ── Panel izquierdo (solo desktop) ─────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12"
        style={{ backgroundColor: GRAPHITE }}
      >
        <img
          src="/Logoclarochico.svg"
          alt="Flora & Fauna"
          className="w-64 object-contain mb-8"
          style={{ opacity: 0.9 }}
        />
        <p
          className="text-center text-sm leading-relaxed max-w-xs"
          style={{ color: STONE, fontFamily: 'Sailec, sans-serif' }}
        >
          Dashboard de Análisis de Ventas
        </p>
      </div>

      {/* ── Panel derecho (formulario) ──────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">

          {/* Logo mobile (solo visible en pantallas pequeñas) */}
          <div className="flex justify-center mb-8 lg:hidden">
            <img
              src="/Logonegro.svg"
              alt="Flora & Fauna"
              className="h-8 object-contain"
            />
          </div>

          {/* Encabezado */}
          <div className="mb-8">
            <h1
              className="text-3xl font-bold mb-1"
              style={{
                color: GRAPHITE,
                fontFamily: "'Italian Plate No 1', Georgia, serif",
                letterSpacing: '-0.01em',
              }}
            >
              INICIAR SESIÓN
            </h1>

          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Campo usuario */}
            <div className="space-y-1.5">
              <Label
                htmlFor="username"
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: STONE }}
              >
                Usuario
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loginMutation.isPending}
                autoComplete="username"
                className="h-11 text-sm"
                style={{
                  borderColor: 'rgba(145,146,145,0.314)',
                  backgroundColor: PEBBLE,
                  color: GRAPHITE,
                  fontFamily: 'Sailec, sans-serif',
                }}
              />
            </div>

            {/* Campo contraseña */}
            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: STONE }}
              >
                Contraseña
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loginMutation.isPending}
                  autoComplete="current-password"
                  className="h-11 text-sm pr-10"
                  style={{
                    borderColor: 'rgba(145,146,145,0.314)',
                    backgroundColor: PEBBLE,
                    color: GRAPHITE,
                    fontFamily: 'Sailec, sans-serif',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70"
                  style={{ color: STONE }}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Mensaje de error */}
            {error && (
              <p
                className="text-sm font-medium"
                style={{ color: '#BC2C46' }}
              >
                {error}
              </p>
            )}

            {/* Botón de ingreso */}
            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full h-11 rounded-md text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              style={{
                backgroundColor: GRAPHITE,
                color: BONE,
                fontFamily: 'Sailec, sans-serif',
              }}
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Ingresando...
                </>
              ) : (
                'Ingresar'
              )}
            </button>

          </form>
        </div>
      </div>
    </div>
  );
}
