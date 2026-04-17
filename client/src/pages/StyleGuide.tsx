/**
 * StyleGuide.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Página pública de referencia de diseño para el sistema Flora & Fauna.
 * No requiere autenticación. Accesible en /style-guide.
 *
 * PROPÓSITO
 * Esta página documenta todos los tokens de diseño, componentes y patrones
 * visuales del sistema. Puede ser consultada por otros proyectos Manus para
 * replicar el mismo sistema de diseño.
 *
 * CÓMO REPLICAR EN OTRO PROYECTO
 * 1. Copia el bloque de variables CSS de la sección "CSS Exportable" al final
 *    de este archivo (o búscalo en client/src/index.css del proyecto original).
 * 2. Instala las fuentes en /public/fonts/ (ItalianPlateNo1-Bold.otf,
 *    ItalianPlateNo1-Extrabold.otf, Sailec-Regular.otf, Sailec-Medium.otf,
 *    Sailec-Bold.otf, Sailec-Black.otf).
 * 3. Registra las @font-face en tu index.css.
 * 4. Aplica las clases utilitarias: font-heading (títulos), font-sans (cuerpo).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Package,
  Store,
  Users,
  Copy,
  Check,
} from "lucide-react";
import { useState } from "react";

// ─── Datos de ejemplo (Lorem Ipsum / aleatorios) ─────────────────────────────

const BAR_DATA = [
  { mes: "Ene", ventas: 142300, meta: 130000 },
  { mes: "Feb", ventas: 98700, meta: 120000 },
  { mes: "Mar", ventas: 175400, meta: 150000 },
  { mes: "Abr", ventas: 163200, meta: 155000 },
  { mes: "May", ventas: 189500, meta: 170000 },
  { mes: "Jun", ventas: 204100, meta: 180000 },
];

const LINE_DATA = [
  { semana: "S1", tiendaA: 32400, tiendaB: 28100 },
  { semana: "S2", tiendaA: 41200, tiendaB: 35600 },
  { semana: "S3", tiendaA: 38700, tiendaB: 42300 },
  { semana: "S4", tiendaA: 55100, tiendaB: 39800 },
  { semana: "S5", tiendaA: 47900, tiendaB: 51200 },
  { semana: "S6", tiendaA: 62300, tiendaB: 48700 },
];

const PIE_DATA = [
  { name: "Esmeralda", value: 38 },
  { name: "Cobalto", value: 27 },
  { name: "Celeste", value: 18 },
  { name: "Mostaza", value: 11 },
  { name: "Granate", value: 6 },
];

const PIE_COLORS = ["#008064", "#1A6894", "#5BB6B7", "#C49705", "#BC2C46"];

const TABLE_ROWS = [
  { sku: "FF-001234", producto: "Lorem ipsum dolor sit amet consectetur", tienda: "Aviación", cantidad: 142, monto: "S/ 18,432.00", estado: "activo" },
  { sku: "FF-005678", producto: "Adipiscing elit sed do eiusmod tempor", tienda: "San Isidro", cantidad: 87, monto: "S/ 11,205.50", estado: "activo" },
  { sku: "FF-009012", producto: "Incididunt ut labore et dolore magna", tienda: "Miraflores", cantidad: 203, monto: "S/ 26,789.00", estado: "inactivo" },
  { sku: "FF-003456", producto: "Aliqua enim ad minim veniam quis nostrud", tienda: "La Molina", cantidad: 56, monto: "S/ 7,340.00", estado: "activo" },
  { sku: "FF-007890", producto: "Exercitation ullamco laboris nisi aliquip", tienda: "Surco", cantidad: 318, monto: "S/ 41,654.00", estado: "activo" },
];

const PROGRESS_EXAMPLES = [
  { label: "Tienda Aviación", value: 62, meta: 100 },
  { label: "Tienda San Isidro", value: 83, meta: 100 },
  { label: "Tienda Miraflores", value: 97, meta: 100 },
  { label: "Tienda La Molina", value: 112, meta: 100 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function progressColor(pct: number): string {
  if (pct < 75) return "#BC2C46";   // granate
  if (pct < 90) return "#C49705";   // mostaza
  if (pct < 100) return "#1A6894";  // cobalto
  return "#008064";                  // esmeralda
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 0 }).format(n);
}

// ─── Componente auxiliar: Swatch de color ────────────────────────────────────

function ColorSwatch({ hex, name, variable, light = false }: { hex: string; name: string; variable: string; light?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(hex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex flex-col gap-1.5 cursor-pointer group" onClick={copy}>
      <div
        className="h-16 rounded-lg border border-border/40 transition-transform group-hover:scale-105"
        style={{ backgroundColor: hex }}
      />
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-xs font-semibold ${light ? "text-muted-foreground" : "text-foreground"}`}>{name}</p>
          <p className="text-[10px] font-mono text-muted-foreground">{variable}</p>
          <p className="text-[10px] font-mono text-muted-foreground">{hex}</p>
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
        </div>
      </div>
    </div>
  );
}

// ─── Componente auxiliar: Sección con título ─────────────────────────────────

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-6 scroll-mt-20">
      <div className="border-b border-border pb-3">
        <h2 className="text-2xl" style={{ fontFamily: "var(--font-heading)" }}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

// ─── Componente auxiliar: Bloque de código copiable ──────────────────────────

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative">
      <pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-x-auto leading-relaxed text-foreground/80 border border-border/50">
        {code}
      </pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 p-1.5 rounded bg-background border border-border/50 hover:bg-muted transition-colors"
        title="Copiar"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
    </div>
  );
}

// ─── Navegación lateral ───────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: "intro", label: "Introducción" },
  { id: "colores", label: "Colores" },
  { id: "tipografia", label: "Tipografía" },
  { id: "logos", label: "Logos" },
  { id: "botones", label: "Botones" },
  { id: "badges", label: "Badges & Estados" },
  { id: "cards", label: "Cards & KPIs" },
  { id: "tabla", label: "Tablas" },
  { id: "graficos", label: "Gráficos" },
  { id: "formularios", label: "Formularios" },
  { id: "indicadores", label: "Indicadores" },
  { id: "css", label: "CSS Exportable" },
];

// ─── Página principal ─────────────────────────────────────────────────────────

export default function StyleGuide() {
  const [activeSection, setActiveSection] = useState("intro");

  const scrollTo = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const CSS_EXPORT = `/* ═══════════════════════════════════════════════════════════════
   FLORA & FAUNA — Design System CSS
   Copia este bloque en tu client/src/index.css para replicar
   el sistema de diseño en un nuevo proyecto Manus.
   ═══════════════════════════════════════════════════════════════ */

/* 1. Fuentes corporativas — requiere archivos en /public/fonts/ */
@font-face {
  font-family: 'Italian Plate No 1';
  src: url('/fonts/ItalianPlateNo1-Bold.otf') format('opentype');
  font-weight: 700; font-style: normal; font-display: swap;
}
@font-face {
  font-family: 'Italian Plate No 1';
  src: url('/fonts/ItalianPlateNo1-Extrabold.otf') format('opentype');
  font-weight: 800; font-style: normal; font-display: swap;
}
@font-face {
  font-family: 'Sailec';
  src: url('/fonts/Sailec-Regular.otf') format('opentype');
  font-weight: 400; font-style: normal; font-display: swap;
}
@font-face {
  font-family: 'Sailec';
  src: url('/fonts/Sailec-Medium.otf') format('opentype');
  font-weight: 500; font-style: normal; font-display: swap;
}
@font-face {
  font-family: 'Sailec';
  src: url('/fonts/Sailec-Bold.otf') format('opentype');
  font-weight: 700; font-style: normal; font-display: swap;
}
@font-face {
  font-family: 'Sailec';
  src: url('/fonts/Sailec-Black.otf') format('opentype');
  font-weight: 900; font-style: normal; font-display: swap;
}

/* 2. Primitivas de color F&F */
:root {
  /* Colores corporativos */
  --ff-granate:        #BC2C46;
  --ff-esmeralda:      #008064;
  --ff-mostaza:        #C49705;
  --ff-cobalto:        #1A6894;
  --ff-rosado:         #E5BAC1;
  --ff-celeste:        #5BB6B7;

  /* Neutros */
  --ff-beige:          #EAE8E2;
  --ff-hueso:          #F5F4F1;
  --ff-humo:           #919291;
  --ff-carbon:         #232523;
  --ff-blanco:         #FFFFFF;

  /* Variaciones para gráficos */
  --ff-esmeralda-light: #4DA896;
  --ff-esmeralda-dark:  #005A47;
  --ff-cobalto-light:   #6B9AB5;
  --ff-cobalto-dark:    #124A6B;
  --ff-celeste-light:   #9DD3D4;
  --ff-celeste-dark:    #3F8C8D;
  --ff-mostaza-light:   #D9BC5C;
  --ff-mostaza-dark:    #8B6B04;
  --ff-rosado-light:    #F0D9DD;
  --ff-rosado-dark:     #B8848F;
  --ff-granate-light:   #D87A8E;
  --ff-granate-dark:    #842032;

  /* Fuentes */
  --font-heading: 'Italian Plate No 1', sans-serif;
  --font-sans:    'Sailec', system-ui, -apple-system, sans-serif;
}

/* 3. Tokens semánticos — Light Mode */
:root {
  --radius: 0.65rem;
  --background:              oklch(from var(--ff-hueso) l c h);
  --foreground:              oklch(from var(--ff-carbon) l c h);
  --card:                    oklch(from var(--ff-blanco) l c h);
  --card-foreground:         oklch(from var(--ff-carbon) l c h);
  --popover:                 oklch(from var(--ff-blanco) l c h);
  --popover-foreground:      oklch(from var(--ff-carbon) l c h);
  --primary:                 oklch(from var(--ff-carbon) l c h);
  --primary-foreground:      oklch(from var(--ff-hueso) l c h);
  --secondary:               oklch(from var(--ff-beige) l c h);
  --secondary-foreground:    oklch(from var(--ff-carbon) l c h);
  --muted:                   oklch(from var(--ff-beige) l c h);
  --muted-foreground:        oklch(from var(--ff-humo) l c h);
  --accent:                  oklch(from var(--ff-carbon) l c h);
  --accent-foreground:       oklch(from var(--ff-blanco) l c h);
  --destructive:             oklch(from var(--ff-granate) l c h);
  --destructive-foreground:  oklch(from var(--ff-hueso) l c h);
  --border:                  oklch(from var(--ff-humo) l c h / 0.3);
  --input:                   oklch(from var(--ff-humo) l c h / 0.3);
  --ring:                    oklch(from var(--ff-cobalto) l c h);
  --chart-1:                 oklch(from var(--ff-esmeralda) l c h);
  --chart-2:                 oklch(from var(--ff-cobalto) l c h);
  --chart-3:                 oklch(from var(--ff-celeste) l c h);
  --chart-4:                 oklch(from var(--ff-mostaza) l c h);
  --chart-5:                 oklch(from var(--ff-rosado) l c h);
  --sidebar:                 oklch(from var(--ff-hueso) l c h);
  --sidebar-foreground:      oklch(from var(--ff-carbon) l c h);
  --sidebar-primary:         oklch(from var(--ff-carbon) l c h);
  --sidebar-primary-foreground: oklch(from var(--ff-blanco) l c h);
  --sidebar-accent:          oklch(from var(--ff-blanco) l c h);
  --sidebar-accent-foreground: oklch(from var(--ff-carbon) l c h);
  --sidebar-border:          oklch(from var(--ff-humo) l c h / 0.3);
  --sidebar-ring:            oklch(from var(--ff-cobalto) l c h);
}

/* 4. Tokens semánticos — Dark Mode */
.dark {
  --background:              #1a1a1a;
  --foreground:              oklch(from var(--ff-beige) l c h);
  --card:                    #242424;
  --card-foreground:         oklch(from var(--ff-beige) l c h);
  --popover:                 #242424;
  --popover-foreground:      oklch(from var(--ff-beige) l c h);
  --primary:                 oklch(from var(--ff-beige) l c h);
  --primary-foreground:      #1a1a1a;
  --secondary:               #2a2a2a;
  --secondary-foreground:    oklch(from var(--ff-beige) l c h);
  --muted:                   #2a2a2a;
  --muted-foreground:        oklch(from var(--ff-humo) l c h);
  --accent:                  oklch(from var(--ff-beige) l c h);
  --accent-foreground:       #1a1a1a;
  --destructive:             oklch(from var(--ff-granate) l c h);
  --destructive-foreground:  oklch(from var(--ff-hueso) l c h);
  --border:                  oklch(from var(--ff-humo) l c h / 0.3);
  --input:                   oklch(from var(--ff-humo) l c h / 0.4);
  --ring:                    oklch(from var(--ff-cobalto) l c h);
  --chart-1:                 oklch(from var(--ff-esmeralda) l c h);
  --chart-2:                 oklch(from var(--ff-cobalto) l c h);
  --chart-3:                 oklch(from var(--ff-celeste) l c h);
  --chart-4:                 oklch(from var(--ff-mostaza) l c h);
  --chart-5:                 oklch(from var(--ff-rosado) l c h);
  --sidebar:                 #1a1a1a;
  --sidebar-foreground:      oklch(from var(--ff-beige) l c h);
  --sidebar-primary:         oklch(from var(--ff-beige) l c h);
  --sidebar-primary-foreground: #1a1a1a;
  --sidebar-accent:          #2a2a2a;
  --sidebar-accent-foreground: oklch(from var(--ff-beige) l c h);
  --sidebar-border:          oklch(from var(--ff-humo) l c h / 0.3);
  --sidebar-ring:            oklch(from var(--ff-cobalto) l c h);
}

/* 5. Reglas base */
@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground font-sans antialiased; }
  h1, h2, h3 { font-family: var(--font-heading); @apply font-bold tracking-tight uppercase; }
  h4, h5, h6 { @apply font-sans font-bold tracking-tight; }
}

/* 6. Clases utilitarias */
.font-heading { font-family: var(--font-heading); }

/* 7. Reglas de colores de progreso (semáforo de cumplimiento) */
/* 0–74%:  --ff-granate  (#BC2C46) */
/* 75–89%: --ff-mostaza  (#C49705) */
/* 90–99%: --ff-cobalto  (#1A6894) */
/* 100%+:  --ff-esmeralda (#008064) */`;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border/50">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Flora & Fauna" className="h-7" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <span className="text-sm font-semibold text-muted-foreground">/ Style Guide</span>
          </div>
          <Badge variant="secondary" className="text-xs">v1.0 · Flora &amp; Fauna Design System</Badge>
        </div>
      </header>

      <div className="container py-8 flex gap-8">
        {/* ── Sidebar de navegación ──────────────────────────────────────── */}
        <aside className="hidden lg:block w-48 shrink-0">
          <nav className="sticky top-20 space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 pb-2">Contenido</p>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className={`w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeSection === item.id
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* ── Contenido principal ────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 space-y-16">

          {/* ══ INTRODUCCIÓN ══════════════════════════════════════════════ */}
          <Section id="intro" title="Introducción">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">¿Qué es este documento?</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>Esta página centraliza todos los tokens de diseño, componentes y patrones visuales del sistema <strong className="text-foreground">Flora &amp; Fauna</strong>. Sirve como referencia única para mantener consistencia visual en todos los proyectos.</p>
                  <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Principios de diseño</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {[
                      { label: "Claridad", desc: "La información debe ser legible y jerarquizada." },
                      { label: "Consistencia", desc: "Mismos tokens en todos los proyectos." },
                      { label: "Eficiencia", desc: "Componentes reutilizables y bien documentados." },
                      { label: "Accesibilidad", desc: "Contraste mínimo WCAG AA en todos los textos." },
                    ].map((p) => (
                      <div key={p.label} className="flex gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "#008064" }} />
                        <span><strong>{p.label}:</strong> <span className="text-muted-foreground">{p.desc}</span></span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </Section>

          {/* ══ COLORES ═══════════════════════════════════════════════════ */}
          <Section id="colores" title="Colores">
            <div className="space-y-8">
              {/* Paleta corporativa */}
              <div>
                <h4 className="text-sm font-semibold mb-4">Paleta Corporativa</h4>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
                  <ColorSwatch hex="#BC2C46" name="Granate" variable="--ff-granate" />
                  <ColorSwatch hex="#008064" name="Esmeralda" variable="--ff-esmeralda" />
                  <ColorSwatch hex="#C49705" name="Mostaza" variable="--ff-mostaza" />
                  <ColorSwatch hex="#1A6894" name="Cobalto" variable="--ff-cobalto" />
                  <ColorSwatch hex="#E5BAC1" name="Rosado" variable="--ff-rosado" />
                  <ColorSwatch hex="#5BB6B7" name="Celeste" variable="--ff-celeste" />
                </div>
              </div>

              {/* Neutros */}
              <div>
                <h4 className="text-sm font-semibold mb-4">Neutros</h4>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
                  <ColorSwatch hex="#232523" name="Carbón" variable="--ff-carbon" />
                  <ColorSwatch hex="#919291" name="Humo" variable="--ff-humo" />
                  <ColorSwatch hex="#EAE8E2" name="Beige" variable="--ff-beige" light />
                  <ColorSwatch hex="#F5F4F1" name="Hueso" variable="--ff-hueso" light />
                  <ColorSwatch hex="#FFFFFF" name="Blanco" variable="--ff-blanco" light />
                </div>
              </div>

              {/* Variaciones para gráficos */}
              <div>
                <h4 className="text-sm font-semibold mb-4">Variaciones para Gráficos</h4>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
                  <ColorSwatch hex="#4DA896" name="Esmeralda Light" variable="--ff-esmeralda-light" />
                  <ColorSwatch hex="#005A47" name="Esmeralda Dark" variable="--ff-esmeralda-dark" />
                  <ColorSwatch hex="#6B9AB5" name="Cobalto Light" variable="--ff-cobalto-light" />
                  <ColorSwatch hex="#124A6B" name="Cobalto Dark" variable="--ff-cobalto-dark" />
                  <ColorSwatch hex="#9DD3D4" name="Celeste Light" variable="--ff-celeste-light" />
                  <ColorSwatch hex="#3F8C8D" name="Celeste Dark" variable="--ff-celeste-dark" />
                  <ColorSwatch hex="#D9BC5C" name="Mostaza Light" variable="--ff-mostaza-light" />
                  <ColorSwatch hex="#8B6B04" name="Mostaza Dark" variable="--ff-mostaza-dark" />
                  <ColorSwatch hex="#F0D9DD" name="Rosado Light" variable="--ff-rosado-light" light />
                  <ColorSwatch hex="#B8848F" name="Rosado Dark" variable="--ff-rosado-dark" />
                  <ColorSwatch hex="#D87A8E" name="Granate Light" variable="--ff-granate-light" />
                  <ColorSwatch hex="#842032" name="Granate Dark" variable="--ff-granate-dark" />
                </div>
              </div>

              {/* Semáforo de cumplimiento */}
              <div>
                <h4 className="text-sm font-semibold mb-4">Semáforo de Cumplimiento (Progress Colors)</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { range: "0 – 74%", color: "#BC2C46", label: "Granate · Bajo" },
                    { range: "75 – 89%", color: "#C49705", label: "Mostaza · Medio" },
                    { range: "90 – 99%", color: "#1A6894", label: "Cobalto · Bueno" },
                    { range: "100%+", color: "#008064", label: "Esmeralda · Excelente" },
                  ].map((s) => (
                    <div key={s.range} className="rounded-lg border border-border/50 overflow-hidden">
                      <div className="h-10" style={{ backgroundColor: s.color }} />
                      <div className="p-2">
                        <p className="text-xs font-semibold">{s.range}</p>
                        <p className="text-[10px] text-muted-foreground">{s.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* ══ TIPOGRAFÍA ════════════════════════════════════════════════ */}
          <Section id="tipografia" title="Tipografía">
            <div className="space-y-8">
              {/* Familias */}
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Italian Plate No 1 — Títulos</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground font-mono">--font-heading · h1, h2, h3 · uppercase</p>
                    <div className="space-y-2 border-t border-border/50 pt-3">
                      <h1 className="text-4xl leading-none">Lorem Ipsum</h1>
                      <h2 className="text-2xl leading-none">Dolor Sit Amet</h2>
                      <h3 className="text-xl leading-none">Consectetur Adipiscing</h3>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Sailec — Cuerpo y UI</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground font-mono">--font-sans · h4–h6, body, labels</p>
                    <div className="space-y-2 border-t border-border/50 pt-3 font-sans">
                      <h4 className="text-xl">Eiusmod Tempor</h4>
                      <p className="text-base">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                      <p className="text-sm text-muted-foreground">Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
                      <p className="text-xs text-muted-foreground">Ut enim ad minim veniam, quis nostrud exercitation ullamco.</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Escala tipográfica */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Escala Tipográfica</CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-2 text-xs text-muted-foreground font-medium">Clase</th>
                        <th className="text-left py-2 text-xs text-muted-foreground font-medium">Tamaño</th>
                        <th className="text-left py-2 text-xs text-muted-foreground font-medium">Uso</th>
                        <th className="text-left py-2 text-xs text-muted-foreground font-medium">Ejemplo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {[
                        { cls: "text-4xl", size: "2.25rem", uso: "Hero / h1", ex: "Lorem" },
                        { cls: "text-2xl", size: "1.5rem", uso: "Sección / h2", ex: "Lorem Ipsum" },
                        { cls: "text-xl", size: "1.25rem", uso: "Subsección / h3", ex: "Dolor Sit" },
                        { cls: "text-base", size: "1rem", uso: "Cuerpo principal", ex: "Amet consectetur" },
                        { cls: "text-sm", size: "0.875rem", uso: "UI / Labels", ex: "Adipiscing elit sed" },
                        { cls: "text-xs", size: "0.75rem", uso: "Metadatos / Captions", ex: "Do eiusmod tempor incididunt" },
                        { cls: "text-[10px]", size: "0.625rem", uso: "Badges / Chips", ex: "Ut labore et dolore magna" },
                      ].map((r) => (
                        <tr key={r.cls}>
                          <td className="py-2 font-mono text-xs text-muted-foreground">{r.cls}</td>
                          <td className="py-2 text-xs text-muted-foreground">{r.size}</td>
                          <td className="py-2 text-xs text-muted-foreground">{r.uso}</td>
                          <td className={`py-2 ${r.cls}`}>{r.ex}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {/* Pesos */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Pesos de Fuente (Sailec)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { weight: "font-normal", label: "Regular 400", sample: "Lorem ipsum dolor" },
                      { weight: "font-medium", label: "Medium 500", sample: "Lorem ipsum dolor" },
                      { weight: "font-bold", label: "Bold 700", sample: "Lorem ipsum dolor" },
                      { weight: "font-black", label: "Black 900", sample: "Lorem ipsum dolor" },
                    ].map((w) => (
                      <div key={w.weight} className="space-y-1">
                        <p className="text-[10px] font-mono text-muted-foreground">{w.weight}</p>
                        <p className={`text-sm ${w.weight}`}>{w.sample}</p>
                        <p className="text-[10px] text-muted-foreground">{w.label}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </Section>

          {/* ══ LOGOS ═════════════════════════════════════════════════════ */}
          <Section id="logos" title="Logos">
            <div className="grid md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Logo Principal (SVG)</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center h-32 bg-muted/30 rounded-lg">
                  <img
                    src="/logo.svg"
                    alt="Flora & Fauna Logo"
                    className="max-h-16 max-w-full object-contain"
                    onError={(e) => {
                      const el = e.target as HTMLImageElement;
                      el.style.display = "none";
                      el.parentElement!.innerHTML = '<span class="text-sm text-muted-foreground">/logo.svg</span>';
                    }}
                  />
                </CardContent>
                <div className="px-4 pb-4">
                  <p className="text-xs text-muted-foreground font-mono">Ruta: /public/logo.svg</p>
                  <p className="text-xs text-muted-foreground">Uso: navegación, headers</p>
                </div>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Logo sobre fondo oscuro</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center h-32 rounded-lg" style={{ backgroundColor: "#232523" }}>
                  <img
                    src="/logo-white.svg"
                    alt="Flora & Fauna Logo Blanco"
                    className="max-h-16 max-w-full object-contain"
                    onError={(e) => {
                      const el = e.target as HTMLImageElement;
                      el.style.display = "none";
                      el.parentElement!.innerHTML = '<span class="text-sm" style="color:#F5F4F1">/logo-white.svg</span>';
                    }}
                  />
                </CardContent>
                <div className="px-4 pb-4">
                  <p className="text-xs text-muted-foreground font-mono">Ruta: /public/logo-white.svg</p>
                  <p className="text-xs text-muted-foreground">Uso: sidebar oscuro, dark mode</p>
                </div>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Favicon / Ícono</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center h-32 bg-muted/30 rounded-lg gap-6">
                  {[64, 32, 16].map((size) => (
                    <div key={size} className="flex flex-col items-center gap-1">
                      <img
                        src="/favicon.ico"
                        alt="Favicon"
                        style={{ width: size, height: size }}
                        className="object-contain"
                        onError={(e) => {
                          const el = e.target as HTMLImageElement;
                          el.style.display = "none";
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground">{size}px</span>
                    </div>
                  ))}
                </CardContent>
                <div className="px-4 pb-4">
                  <p className="text-xs text-muted-foreground font-mono">Ruta: /public/favicon.ico</p>
                  <p className="text-xs text-muted-foreground">Uso: pestaña del navegador</p>
                </div>
              </Card>
            </div>

            {/* Reglas de uso */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Reglas de Uso del Logo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6 text-sm">
                  <div className="space-y-2">
                    <p className="font-semibold flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" style={{ color: "#008064" }} /> Correcto</p>
                    <ul className="space-y-1 text-muted-foreground text-xs">
                      <li>• Usar sobre fondo hueso (#F5F4F1) o blanco (#FFFFFF)</li>
                      <li>• Versión blanca sobre fondos oscuros (carbón #232523)</li>
                      <li>• Mantener espacio libre mínimo de 1× la altura del logo</li>
                      <li>• Escalar proporcionalmente sin distorsión</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <p className="font-semibold flex items-center gap-1.5"><XCircle className="h-4 w-4" style={{ color: "#BC2C46" }} /> Incorrecto</p>
                    <ul className="space-y-1 text-muted-foreground text-xs">
                      <li>• No usar sobre fondos de color saturado</li>
                      <li>• No rotar ni inclinar el logo</li>
                      <li>• No cambiar los colores corporativos</li>
                      <li>• No agregar sombras ni efectos visuales</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Section>

          {/* ══ BOTONES ═══════════════════════════════════════════════════ */}
          <Section id="botones" title="Botones">
            <div className="space-y-6">
              {/* Variantes */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Variantes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3 items-center">
                    <Button variant="default">Default</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="outline">Outline</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button variant="destructive">Destructive</Button>
                    <Button variant="link">Link</Button>
                  </div>
                </CardContent>
              </Card>

              {/* Tamaños */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Tamaños</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3 items-center">
                    <Button size="lg">Large</Button>
                    <Button size="default">Default</Button>
                    <Button size="sm">Small</Button>
                    <Button size="icon"><Package className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>

              {/* Con iconos */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Con Iconos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3 items-center">
                    <Button><TrendingUp className="h-4 w-4 mr-2" />Ver Ventas</Button>
                    <Button variant="outline"><Package className="h-4 w-4 mr-2" />Catálogo</Button>
                    <Button variant="secondary"><Store className="h-4 w-4 mr-2" />Tiendas</Button>
                    <Button variant="destructive"><XCircle className="h-4 w-4 mr-2" />Eliminar</Button>
                  </div>
                </CardContent>
              </Card>

              {/* Estados */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Estados</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3 items-center">
                    <Button>Normal</Button>
                    <Button disabled>Deshabilitado</Button>
                    <Button className="opacity-70 cursor-wait">Cargando...</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </Section>

          {/* ══ BADGES & ESTADOS ══════════════════════════════════════════ */}
          <Section id="badges" title="Badges & Estados">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Variantes de Badge</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3 items-center">
                    <Badge>Default</Badge>
                    <Badge variant="secondary">Secondary</Badge>
                    <Badge variant="outline">Outline</Badge>
                    <Badge variant="destructive">Destructive</Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Badges de estado personalizados */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Badges de Estado (Personalizados)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3 items-center">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: "#008064", color: "#F5F4F1" }}>
                      <CheckCircle2 className="h-3 w-3" /> Activo
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: "#BC2C46", color: "#F5F4F1" }}>
                      <XCircle className="h-3 w-3" /> Inactivo
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: "#C49705", color: "#F5F4F1" }}>
                      <AlertTriangle className="h-3 w-3" /> Pendiente
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: "#1A6894", color: "#F5F4F1" }}>
                      <Info className="h-3 w-3" /> Información
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                      Neutro
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Alertas */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Alertas / Banners</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { icon: CheckCircle2, color: "#008064", bg: "#008064", label: "Éxito", msg: "Lorem ipsum dolor sit amet, consectetur adipiscing elit." },
                    { icon: AlertTriangle, color: "#C49705", bg: "#C49705", label: "Advertencia", msg: "Sed do eiusmod tempor incididunt ut labore et dolore magna." },
                    { icon: XCircle, color: "#BC2C46", bg: "#BC2C46", label: "Error", msg: "Ut enim ad minim veniam, quis nostrud exercitation ullamco." },
                    { icon: Info, color: "#1A6894", bg: "#1A6894", label: "Información", msg: "Duis aute irure dolor in reprehenderit in voluptate velit esse." },
                  ].map((a) => (
                    <div key={a.label} className="flex gap-3 p-3 rounded-lg border" style={{ borderColor: `${a.bg}30`, backgroundColor: `${a.bg}10` }}>
                      <a.icon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: a.color }} />
                      <div>
                        <p className="text-sm font-semibold" style={{ color: a.color }}>{a.label}</p>
                        <p className="text-xs text-muted-foreground">{a.msg}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </Section>

          {/* ══ CARDS & KPIs ══════════════════════════════════════════════ */}
          <Section id="cards" title="Cards & KPIs">
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { icon: ShoppingCart, label: "Ventas Totales", value: "S/ 284,320", delta: "+12.4%", up: true, color: "#008064" },
                  { icon: Package, label: "Unidades Vendidas", value: "18,432", delta: "+8.7%", up: true, color: "#1A6894" },
                  { icon: Store, label: "Tiendas Activas", value: "24", delta: "-1", up: false, color: "#C49705" },
                  { icon: Users, label: "Clientes Únicos", value: "9,871", delta: "+5.2%", up: true, color: "#5BB6B7" },
                ].map((kpi) => (
                  <Card key={kpi.label} className="border-border/50">
                    <CardContent className="pt-4 pb-3 px-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="p-1.5 rounded-md" style={{ backgroundColor: `${kpi.color}15` }}>
                          <kpi.icon className="h-4 w-4" style={{ color: kpi.color }} />
                        </div>
                        <span className={`text-xs font-medium flex items-center gap-0.5 ${kpi.up ? "text-emerald-600" : "text-rose-600"}`}>
                          {kpi.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {kpi.delta}
                        </span>
                      </div>
                      <p className="text-xl font-bold tabular-nums">{kpi.value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{kpi.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Card estándar */}
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Card Estándar</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.</p>
                    <div className="mt-4 flex gap-2">
                      <Button size="sm">Acción Principal</Button>
                      <Button size="sm" variant="outline">Cancelar</Button>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4" style={{ borderLeftColor: "#1A6894" }}>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#1A6894" }} />
                      Card con Acento
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    <p>Quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit.</p>
                    <div className="mt-3 flex items-center gap-2">
                      <Badge variant="secondary">Lorem</Badge>
                      <Badge variant="secondary">Ipsum</Badge>
                      <Badge variant="secondary">Dolor</Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </Section>

          {/* ══ TABLAS ════════════════════════════════════════════════════ */}
          <Section id="tabla" title="Tablas">
            <div className="space-y-6">
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Tabla de Datos — Ventas por Artículo</CardTitle>
                    <div className="flex gap-2">
                      <Badge variant="secondary">142 filas</Badge>
                      <Button variant="outline" size="sm" className="h-7 text-xs">Exportar</Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/50 hover:bg-transparent">
                          <TableHead className="pl-4 text-xs font-semibold">SKU</TableHead>
                          <TableHead className="text-xs font-semibold">Producto</TableHead>
                          <TableHead className="text-xs font-semibold">Tienda</TableHead>
                          <TableHead className="text-right text-xs font-semibold">Cantidad</TableHead>
                          <TableHead className="text-right text-xs font-semibold">Monto</TableHead>
                          <TableHead className="text-center text-xs font-semibold">Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {TABLE_ROWS.map((row) => (
                          <TableRow key={row.sku} className="border-border/50 hover:bg-muted/40 transition-colors">
                            <TableCell className="pl-4 tabular-nums tracking-tight text-xs text-muted-foreground">{row.sku}</TableCell>
                            <TableCell className="text-sm max-w-[200px] truncate">{row.producto}</TableCell>
                            <TableCell className="text-sm">
                              <div className="flex items-center gap-1.5">
                                <Store className="h-3 w-3 text-muted-foreground" />
                                {row.tienda}
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{row.cantidad.toLocaleString("es-PE")}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm font-medium" style={{ color: "#008064" }}>{row.monto}</TableCell>
                            <TableCell className="text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                row.estado === "activo"
                                  ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30"
                                  : "text-rose-700 bg-rose-50 dark:bg-rose-950/30"
                              }`}>
                                {row.estado === "activo" ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                                {row.estado}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Fila de totales */}
                        <TableRow className="border-t-2 border-border font-semibold bg-muted/30">
                          <TableCell className="pl-4 text-sm" colSpan={3}>Total General</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">806</TableCell>
                          <TableCell className="text-right tabular-nums text-sm" style={{ color: "#008064" }}>S/ 105,420.50</TableCell>
                          <TableCell />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Paginación */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Mostrando 1–5 de 142 resultados</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled>Anterior</Button>
                  <Button variant="outline" size="sm">Siguiente</Button>
                </div>
              </div>
            </div>
          </Section>

          {/* ══ GRÁFICOS ══════════════════════════════════════════════════ */}
          <Section id="graficos" title="Gráficos">
            <div className="space-y-6">
              {/* Barras */}
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Gráfico de Barras — Ventas vs Meta</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={BAR_DATA} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: number) => fmtCurrency(v)} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="ventas" name="Ventas" fill="#008064" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="meta" name="Meta" fill="#1A6894" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Líneas */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Gráfico de Líneas — Tendencia Semanal</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={LINE_DATA} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: number) => fmtCurrency(v)} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="tiendaA" name="Tienda A" stroke="#008064" strokeWidth={2} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="tiendaB" name="Tienda B" stroke="#1A6894" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Área + Pie */}
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Gráfico de Área — Acumulado Mensual</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={BAR_DATA} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#008064" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#008064" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: number) => fmtCurrency(v)} />
                        <Area type="monotone" dataKey="ventas" name="Ventas" stroke="#008064" fill="url(#colorVentas)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Gráfico de Torta — Distribución por Categoría</CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center gap-4">
                    <ResponsiveContainer width="60%" height={220}>
                      <PieChart>
                        <Pie data={PIE_DATA} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                          {PIE_DATA.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => `${v}%`} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5 flex-1">
                      {PIE_DATA.map((d, i) => (
                        <div key={d.name} className="flex items-center gap-2 text-xs">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i] }} />
                          <span className="flex-1 text-muted-foreground">{d.name}</span>
                          <span className="font-semibold tabular-nums">{d.value}%</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </Section>

          {/* ══ FORMULARIOS ═══════════════════════════════════════════════ */}
          <Section id="formularios" title="Formularios">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Campos de Entrada</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="demo-text">Texto</Label>
                    <Input id="demo-text" placeholder="Lorem ipsum dolor sit amet..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="demo-date">Fecha</Label>
                    <Input id="demo-date" type="date" defaultValue="2026-04-08" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="demo-number">Número</Label>
                    <Input id="demo-number" type="number" placeholder="0.00" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Deshabilitado</Label>
                    <Input placeholder="Campo deshabilitado" disabled />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Selects y Controles</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Select estándar</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar opción..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="a">Lorem ipsum dolor</SelectItem>
                        <SelectItem value="b">Consectetur adipiscing</SelectItem>
                        <SelectItem value="c">Sed do eiusmod tempor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Select con valor</Label>
                    <Select defaultValue="b">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="a">Lorem ipsum dolor</SelectItem>
                        <SelectItem value="b">Consectetur adipiscing</SelectItem>
                        <SelectItem value="c">Sed do eiusmod tempor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button className="flex-1">Guardar</Button>
                    <Button variant="outline" className="flex-1">Cancelar</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </Section>

          {/* ══ INDICADORES ═══════════════════════════════════════════════ */}
          <Section id="indicadores" title="Indicadores">
            <div className="space-y-6">
              {/* Barras de progreso con semáforo */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Barras de Progreso — Semáforo de Cumplimiento</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {PROGRESS_EXAMPLES.map((p) => {
                    const pct = Math.round((p.value / p.meta) * 100);
                    const color = progressColor(pct);
                    return (
                      <div key={p.label} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{p.label}</span>
                          <span className="font-bold tabular-nums" style={{ color }}>{pct}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>S/ {p.value.toLocaleString("es-PE")}</span>
                          <span>Meta: S/ {p.meta.toLocaleString("es-PE")}</span>
                        </div>
                      </div>
                    );
                  })}
                  {/* Leyenda */}
                  <div className="flex flex-wrap gap-3 pt-2 border-t border-border/50">
                    {[
                      { color: "#BC2C46", label: "< 75% Granate" },
                      { color: "#C49705", label: "75–89% Mostaza" },
                      { color: "#1A6894", label: "90–99% Cobalto" },
                      { color: "#008064", label: "≥ 100% Esmeralda" },
                    ].map((l) => (
                      <div key={l.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                        {l.label}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Métricas comparativas */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Ticket Promedio", value: "S/ 142.30", sub: "vs S/ 128.50 mes anterior", up: true },
                  { label: "Conversión", value: "68.4%", sub: "vs 71.2% mes anterior", up: false },
                  { label: "Devoluciones", value: "2.1%", sub: "vs 3.4% mes anterior", up: true },
                  { label: "NPS", value: "72", sub: "vs 68 mes anterior", up: true },
                ].map((m) => (
                  <Card key={m.label} className="border-border/50">
                    <CardContent className="pt-4 pb-3 px-4">
                      <p className="text-xs text-muted-foreground mb-1">{m.label}</p>
                      <p className="text-2xl font-bold tabular-nums">{m.value}</p>
                      <p className={`text-[10px] mt-1 flex items-center gap-0.5 ${m.up ? "text-emerald-600" : "text-rose-600"}`}>
                        {m.up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                        {m.sub}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </Section>

          {/* ══ CSS EXPORTABLE ════════════════════════════════════════════ */}
          <Section id="css" title="CSS Exportable">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Copy className="h-4 w-4" />
                  Bloque CSS completo para copiar en nuevos proyectos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Copia el siguiente bloque en el archivo <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">client/src/index.css</code> de tu nuevo proyecto Manus para aplicar el sistema de diseño completo de Flora &amp; Fauna.
                </p>
                <CodeBlock code={CSS_EXPORT} />
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/50 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Requisitos previos</p>
                  <p>1. Copia los archivos de fuentes desde <code className="font-mono">/public/fonts/</code> del proyecto original al nuevo proyecto.</p>
                  <p>2. Instala Tailwind CSS 4 y configura el <code className="font-mono">@theme inline</code> con las referencias a las variables CSS.</p>
                  <p>3. Asegúrate de que el <code className="font-mono">ThemeProvider</code> use <code className="font-mono">defaultTheme="system"</code> para respetar la preferencia del usuario.</p>
                </div>
              </CardContent>
            </Card>
          </Section>

          {/* Pie de página */}
          <footer className="border-t border-border/50 pt-8 pb-4 text-center text-xs text-muted-foreground">
            <p>Flora &amp; Fauna Design System · Versión 1.0 · Uso interno</p>
            <p className="mt-1">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt.</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
