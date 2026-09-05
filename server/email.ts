/**
 * Email helper using Brevo (ex-Sendinblue) transactional API v4.
 * Sends welcome emails to newly created users with their access credentials.
 */
import { BrevoClient } from "@getbrevo/brevo";
import { ENV } from "./_core/env";
import {
  buildDomainChangeNoticeHtml,
  buildDomainChangeNoticeText,
  DOMAIN_CHANGE_NOTICE_REPLY_TO,
  DOMAIN_CHANGE_NOTICE_SENDER,
  DOMAIN_CHANGE_NOTICE_SUBJECT,
} from "./domainChangeAnnouncement";

// CDN URLs for Flora & Fauna logos
const LOGO_DARK_URL =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663237488769/yXNYDcQnGVpTzYUo.svg";

// Brand colors — Flora & Fauna Design System
const COLORS = {
  bg: "#F5F4F1",          // Hueso
  card: "#FFFFFF",         // Blanco
  primary: "#232523",      // Carbón
  accent: "#008064",       // Esmeralda
  accentLight: "#E6F4F1", // Esmeralda claro
  granate: "#BC2C46",      // Granate
  granateLight: "#FAEAED",
  mostaza: "#C49705",      // Mostaza
  mostazaLight: "#FDF6E3",
  cobalto: "#1A6894",      // Cobalto
  cobaltaLight: "#E8F1F7",
  border: "#EAE8E2",       // Beige
  textMuted: "#919291",    // Humo
  textBody: "#232523",     // Carbón
};

export type DomainChangeEmailResult =
  | { ok: true; messageId: string | null }
  | { ok: false; errorCode: "BREVO_NOT_CONFIGURED" | "INVALID_RECIPIENT" | "SEND_FAILED" };

const BREVO_TRANSACTIONAL_EMAIL_URL = "https://api.brevo.com/v3/smtp/email";

/**
 * Envía un aviso individual para mantener privados los destinatarios.
 * La resolución de usuarios e idempotencia permanece en el backend del router.
 */
export async function sendDomainChangeEmail(params: {
  recipientName: string | null;
  recipientEmail: string;
  publicUrl: string;
  isTest?: boolean;
}): Promise<DomainChangeEmailResult> {
  const recipientEmail = params.recipientEmail.trim().toLowerCase();
  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return { ok: false, errorCode: "INVALID_RECIPIENT" };
  }

  if (!ENV.brevoApiKey) {
    return { ok: false, errorCode: "BREVO_NOT_CONFIGURED" };
  }

  try {
    const response = await fetch(BREVO_TRANSACTIONAL_EMAIL_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": ENV.brevoApiKey,
      },
      body: JSON.stringify({
      subject: params.isTest ? `[PRUEBA] ${DOMAIN_CHANGE_NOTICE_SUBJECT}` : DOMAIN_CHANGE_NOTICE_SUBJECT,
      htmlContent: buildDomainChangeNoticeHtml({
        recipientName: params.recipientName,
        publicUrl: params.publicUrl,
      }),
      textContent: buildDomainChangeNoticeText({
        recipientName: params.recipientName,
        publicUrl: params.publicUrl,
      }),
      sender: DOMAIN_CHANGE_NOTICE_SENDER,
      replyTo: DOMAIN_CHANGE_NOTICE_REPLY_TO,
      to: [{ email: recipientEmail, name: params.recipientName?.trim() || "Usuario" }],
      tags: ["domain-change-notice", params.isTest ? "test" : "bulk"],
      }),
    });

    if (!response.ok) {
      console.error("[Email] Brevo domain-change API rejected delivery:", response.status);
      return { ok: false, errorCode: "SEND_FAILED" };
    }

    const result = (await response.json().catch(() => null)) as { messageId?: unknown } | null;
    return {
      ok: true,
      messageId: typeof result?.messageId === "string" ? result.messageId : null,
    };
  } catch (error) {
    console.error("[Email] Brevo domain-change API delivery failed:", error instanceof Error ? error.name : "unknown_error");
    return { ok: false, errorCode: "SEND_FAILED" };
  }
}

/**
 * Generates the welcome email HTML with Flora & Fauna branding.
 */
function buildWelcomeEmailHtml(params: {
  name: string;
  username: string;
  password: string;
  appUrl: string;
  role: string;
}): string {
  const { name, username, password, appUrl, role } = params;
  const roleLabel = role === "admin" ? "Administrador" : "Analista";
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bienvenido al Dashboard de Ventas – Flora &amp; Fauna</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.bg};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.bg};min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Email card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:${COLORS.card};border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(37,35,37,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:${COLORS.primary};padding:32px 40px;text-align:center;">
              <img
                src="${LOGO_DARK_URL}"
                alt="Flora &amp; Fauna"
                width="181"
                height="19"
                style="display:block;margin:0 auto;filter:invert(1) brightness(2);"
              />
              <p style="margin:16px 0 0;color:#C8C4BE;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;font-weight:500;">
                Dashboard de Ventas
              </p>
            </td>
          </tr>

          <!-- Decorative stripe -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,${COLORS.accent} 0%,#80C8CA 50%,${COLORS.accent} 100%);"></td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">

              <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:${COLORS.primary};letter-spacing:-0.02em;">
                ¡Bienvenido, ${name}!
              </h1>
              <p style="margin:0 0 28px;font-size:15px;color:${COLORS.textMuted};line-height:1.6;">
                Tu cuenta ha sido creada exitosamente en el <strong style="color:${COLORS.textBody};">Dashboard de Ventas Flora &amp; Fauna</strong>.
                A continuación encontrarás tus credenciales de acceso.
              </p>

              <!-- Role badge — Esmeralda claro (activo) -->
              <div style="display:inline-block;background-color:${COLORS.accentLight};border:1px solid #A0D4C8;border-radius:20px;padding:4px 14px;margin-bottom:28px;">
                <span style="font-size:12px;font-weight:600;color:${COLORS.accent};letter-spacing:0.08em;text-transform:uppercase;">
                  ${roleLabel}
                </span>
              </div>

              <!-- Credentials card -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.bg};border:1px solid ${COLORS.border};border-radius:10px;margin-bottom:28px;overflow:hidden;">
                <tr>
                  <td style="padding:20px 24px;border-bottom:1px solid ${COLORS.border};">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:${COLORS.textMuted};letter-spacing:0.08em;text-transform:uppercase;">URL de Acceso</p>
                    <a href="${appUrl}" style="font-size:14px;color:${COLORS.accent};text-decoration:none;font-weight:500;word-break:break-all;">${appUrl}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 24px;border-bottom:1px solid ${COLORS.border};">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:${COLORS.textMuted};letter-spacing:0.08em;text-transform:uppercase;">Usuario</p>
                    <p style="margin:0;font-size:16px;font-weight:700;color:${COLORS.primary};font-family:'Courier New',Courier,monospace;letter-spacing:0.04em;">${username}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:${COLORS.textMuted};letter-spacing:0.08em;text-transform:uppercase;">Contraseña Temporal</p>
                    <p style="margin:0;font-size:16px;font-weight:700;color:${COLORS.primary};font-family:'Courier New',Courier,monospace;letter-spacing:0.08em;">${password}</p>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a
                      href="${appUrl}"
                      style="display:inline-block;background-color:${COLORS.primary};color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:14px 36px;border-radius:8px;"
                    >
                      Ingresar al Dashboard →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Security notice -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color:#C49705;border:1px solid #EACB82;border-radius:8px;padding:14px 18px;">
                    <p style="margin:0;font-size:13px;color:#624C02;line-height:1.5;">
                      <strong>⚠ Seguridad:</strong> Te recomendamos cambiar tu contraseña en el primer inicio de sesión.
                      Guarda estas credenciales en un lugar seguro y no las compartas.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid ${COLORS.border};margin:0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;text-align:center;">
              <p style="margin:0 0 8px;font-size:12px;color:${COLORS.textMuted};line-height:1.6;">
                Este correo fue generado automáticamente por el sistema de gestión de usuarios.<br/>
                Si no solicitaste esta cuenta, por favor contacta al administrador del sistema.
              </p>
              <p style="margin:0;font-size:11px;color:${COLORS.textMuted};">
                &copy; ${year} Flora &amp; Fauna &middot; Dashboard de Ventas
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

export interface WelcomeEmailParams {
  /** Recipient full name */
  name: string;
  /** Recipient email address */
  email: string;
  /** Username for login */
  username: string;
  /** Plain-text password (before hashing) */
  password: string;
  /** The app URL the user should visit */
  appUrl: string;
  /** User role: 'admin' | 'user' */
  role: string;
}

/**
 * Sends a welcome email to a newly created user via Brevo.
 * Returns true on success, false if the API key is missing or the call fails.
 */
export async function sendWelcomeEmail(params: WelcomeEmailParams): Promise<boolean> {
  const apiKey = ENV.brevoApiKey;

  if (!apiKey) {
    console.warn("[Email] BREVO_API_KEY not set — skipping welcome email");
    return false;
  }

  if (!params.email) {
    console.warn("[Email] No email address provided — skipping welcome email for user:", params.username);
    return false;
  }

  try {
    const client = new BrevoClient({ apiKey });

    await client.transactionalEmails.sendTransacEmail({
      subject: "Bienvenido al Dashboard de Ventas – Flora & Fauna",
      htmlContent: buildWelcomeEmailHtml({
        name: params.name,
        username: params.username,
        password: params.password,
        appUrl: params.appUrl,
        role: params.role,
      }),
      sender: {
        name: "Flora & Fauna · Dashboard",
        email: "portaldeventas@florayfauna.pe",
      },
      to: [
        {
          email: params.email,
          name: params.name,
        },
      ],
      replyTo: {
        email: "soporte@florayfauna.pe",
        name: "Soporte Flora & Fauna",
      },
    });

    console.log(`[Email] Welcome email sent to ${params.email} (user: ${params.username})`);
    return true;
  } catch (error: any) {
    console.error("[Email] Failed to send welcome email:", error?.message ?? error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Password Reset / Change Notification Email
// ---------------------------------------------------------------------------

/**
 * Generates the password-reset notification email HTML with Flora & Fauna branding.
 */
function buildPasswordResetEmailHtml(params: {
  name: string;
  appUrl: string;
  changedByAdmin: boolean;
}): string {
  const { name, appUrl, changedByAdmin } = params;
  const year = new Date().getFullYear();
  const actionLabel = changedByAdmin
    ? "Un administrador ha restablecido tu contraseña"
    : "Tu contraseña ha sido actualizada";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Restablecimiento de Contraseña – Flora &amp; Fauna</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.bg};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.bg};min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Email card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:${COLORS.card};border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(37,35,37,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:${COLORS.primary};padding:32px 40px;text-align:center;">
              <img
                src="${LOGO_DARK_URL}"
                alt="Flora &amp; Fauna"
                width="181"
                height="19"
                style="display:block;margin:0 auto;filter:invert(1) brightness(2);"
              />
              <p style="margin:16px 0 0;color:#C8C4BE;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;font-weight:500;">
                Dashboard de Ventas
              </p>
            </td>
          </tr>

          <!-- Accent stripe — amber/warning tone for password change -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#B45309 0%,#D97706 50%,#B45309 100%);"></td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">

              <!-- Icon + title -->
              <div style="text-align:center;margin-bottom:24px;">
                <div style="display:inline-block;background-color:#C49705;border:1px solid #EACB82;border-radius:50%;width:56px;height:56px;line-height:56px;font-size:26px;">
                  🔑
                </div>
              </div>

              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:${COLORS.primary};letter-spacing:-0.02em;text-align:center;">
                ${actionLabel}
              </h1>
              <p style="margin:0 0 28px;font-size:15px;color:${COLORS.textMuted};line-height:1.6;text-align:center;">
                Hola <strong style="color:${COLORS.textBody};">${name}</strong>, se registró una actualización de tu contraseña de acceso.
              </p>

              <!-- Access notice -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.bg};border:1px solid ${COLORS.border};border-radius:10px;margin-bottom:28px;overflow:hidden;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:${COLORS.textMuted};letter-spacing:0.08em;text-transform:uppercase;">URL de Acceso</p>
                    <a href="${appUrl}" style="font-size:14px;color:${COLORS.accent};text-decoration:none;font-weight:500;word-break:break-all;">${appUrl}</a>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a
                      href="${appUrl}"
                      style="display:inline-block;background-color:${COLORS.primary};color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:14px 36px;border-radius:8px;"
                    >
                      Ingresar al Dashboard →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Security notice -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color:#C49705;border:1px solid #EACB82;border-radius:8px;padding:14px 18px;">
                    <p style="margin:0;font-size:13px;color:#624C02;line-height:1.5;">
                      <strong>Seguridad:</strong> Por protección de tu cuenta, este correo no incluye contraseñas ni credenciales.
                      Si no solicitaste este cambio, contacta al administrador del sistema de inmediato.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid ${COLORS.border};margin:0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;text-align:center;">
              <p style="margin:0 0 8px;font-size:12px;color:${COLORS.textMuted};line-height:1.6;">
                Este correo fue generado automáticamente por el sistema de gestión de usuarios.<br/>
                Si no reconoces esta acción, contacta al administrador del sistema.
              </p>
              <p style="margin:0;font-size:11px;color:${COLORS.textMuted};">
                &copy; ${year} Flora &amp; Fauna &middot; Dashboard de Ventas
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

export interface PasswordResetEmailParams {
  /** Recipient full name */
  name: string;
  /** Recipient email address */
  email: string;
  /** The app URL the user should visit */
  appUrl: string;
  /** Whether the change was made by an admin (vs the user themselves) */
  changedByAdmin?: boolean;
}

/**
 * Sends a password-reset notification email to the user via Brevo.
 * Returns true on success, false if the API key is missing or the call fails.
 */
export async function sendPasswordResetEmail(params: PasswordResetEmailParams): Promise<boolean> {
  const apiKey = ENV.brevoApiKey;

  if (!apiKey) {
    console.warn("[Email] BREVO_API_KEY not set — skipping password reset email");
    return false;
  }

  if (!params.email) {
    console.warn("[Email] No email address for user — skipping password-reset notice");
    return false;
  }

  try {
    const client = new BrevoClient({ apiKey });

    await client.transactionalEmails.sendTransacEmail({
      subject: "Tu contraseña ha sido restablecida – Flora & Fauna Dashboard",
      htmlContent: buildPasswordResetEmailHtml({
        name: params.name,
        appUrl: params.appUrl,
        changedByAdmin: params.changedByAdmin ?? true,
      }),
      sender: {
        name: "Flora & Fauna · Dashboard",
        email: "portaldeventas@florayfauna.pe",
      },
      to: [
        {
          email: params.email,
          name: params.name,
        },
      ],
      replyTo: {
        email: "soporte@florayfauna.pe",
        name: "Soporte Flora & Fauna",
      },
    });

    console.log("[Email] Password-reset security notice sent");
    return true;
  } catch (error: any) {
    console.error("[Email] Failed to send password reset email:", error?.message ?? error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Discrepancy Ticket Notification Email (sent to admins)
// ---------------------------------------------------------------------------

const PRIORITY_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  low:    { label: "Baja",  color: "#6B7280", emoji: "🟢" },
  medium: { label: "Media", color: "#D97706", emoji: "🟡" },
  high:   { label: "Alta",  color: "#DC2626", emoji: "🔴" },
};

const MODULE_LABELS: Record<string, string> = {
  "sales-by-category": "Análisis por Categorías",
  "hourly-analysis":   "Análisis por Horas",
  "sales-vs-target":   "Ventas vs Meta",
};

function formatAmount(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return `S/ ${amount.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Generates the ticket notification email HTML with Flora & Fauna branding.
 */
function buildTicketNotificationEmailHtml(params: {
  ticketId: number;
  module: string;
  dateFrom: string;
  dateTo: string;
  storeName: string;
  reportedByName: string;
  priority: string;
  description: string;
  dashboardAmount?: number | null;
  analystAmount?: number | null;
  difference?: number | null;
  dataSource?: string | null;
  appUrl: string;
}): string {
  const {
    ticketId, module, dateFrom, dateTo, storeName,
    reportedByName, priority, description,
    dashboardAmount, analystAmount, difference,
    dataSource, appUrl,
  } = params;

  const year = new Date().getFullYear();
  const moduleLabel = MODULE_LABELS[module] ?? module;
  const prio = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.medium;
  const ticketUrl = `${appUrl}/tickets`;

  const hasDifference =
    dashboardAmount != null && analystAmount != null;

  const differenceColor =
    (difference ?? 0) < 0 ? "#DC2626" : (difference ?? 0) > 0 ? "#D97706" : COLORS.textBody;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ticket #${ticketId} – Discrepancia Reportada</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.bg};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.bg};min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Email card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0"
          style="max-width:600px;width:100%;background-color:${COLORS.card};border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(37,35,37,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:${COLORS.primary};padding:32px 40px;text-align:center;">
              <img
                src="${LOGO_DARK_URL}"
                alt="Flora &amp; Fauna"
                width="181" height="19"
                style="display:block;margin:0 auto;filter:invert(1) brightness(2);"
              />
              <p style="margin:16px 0 0;color:#C8C4BE;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;font-weight:500;">
                Dashboard de Ventas · Sistema de Tickets
              </p>
            </td>
          </tr>

          <!-- Accent stripe — red for discrepancy alert -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#991B1B 0%,#DC2626 50%,#991B1B 100%);"></td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 28px;">

              <!-- Icon + title -->
              <div style="text-align:center;margin-bottom:20px;">
                <div style="display:inline-block;background-color:#FEF2F2;border:1px solid #FECACA;border-radius:50%;width:56px;height:56px;line-height:56px;font-size:26px;">
                  🚨
                </div>
              </div>

              <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:${COLORS.primary};letter-spacing:-0.02em;text-align:center;">
                Nueva Discrepancia Reportada
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:${COLORS.textMuted};text-align:center;">
                Ticket <strong style="color:${COLORS.primary};">#${ticketId}</strong> · Reportado por <strong style="color:${COLORS.textBody};">${reportedByName}</strong>
              </p>

              <!-- Ticket metadata card -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                style="background-color:${COLORS.bg};border:1px solid ${COLORS.border};border-radius:10px;margin-bottom:24px;overflow:hidden;">

                <tr>
                  <td width="50%" style="padding:14px 20px;border-bottom:1px solid ${COLORS.border};border-right:1px solid ${COLORS.border};">
                    <p style="margin:0 0 3px;font-size:10px;font-weight:600;color:${COLORS.textMuted};letter-spacing:0.08em;text-transform:uppercase;">Módulo</p>
                    <p style="margin:0;font-size:14px;font-weight:600;color:${COLORS.primary};">${moduleLabel}</p>
                  </td>
                  <td width="50%" style="padding:14px 20px;border-bottom:1px solid ${COLORS.border};">
                    <p style="margin:0 0 3px;font-size:10px;font-weight:600;color:${COLORS.textMuted};letter-spacing:0.08em;text-transform:uppercase;">Prioridad</p>
                    <p style="margin:0;font-size:14px;font-weight:700;color:${prio.color};">${prio.emoji} ${prio.label}</p>
                  </td>
                </tr>

                <tr>
                  <td width="50%" style="padding:14px 20px;border-bottom:1px solid ${COLORS.border};border-right:1px solid ${COLORS.border};">
                    <p style="margin:0 0 3px;font-size:10px;font-weight:600;color:${COLORS.textMuted};letter-spacing:0.08em;text-transform:uppercase;">Período</p>
                    <p style="margin:0;font-size:13px;font-weight:500;color:${COLORS.textBody};">${dateFrom} → ${dateTo}</p>
                  </td>
                  <td width="50%" style="padding:14px 20px;border-bottom:1px solid ${COLORS.border};">
                    <p style="margin:0 0 3px;font-size:10px;font-weight:600;color:${COLORS.textMuted};letter-spacing:0.08em;text-transform:uppercase;">Tienda</p>
                    <p style="margin:0;font-size:13px;font-weight:500;color:${COLORS.textBody};">${storeName}</p>
                  </td>
                </tr>

                ${hasDifference ? `
                <tr>
                  <td width="50%" style="padding:14px 20px;border-right:1px solid ${COLORS.border};">
                    <p style="margin:0 0 3px;font-size:10px;font-weight:600;color:${COLORS.textMuted};letter-spacing:0.08em;text-transform:uppercase;">Monto Dashboard</p>
                    <p style="margin:0;font-size:15px;font-weight:700;color:${COLORS.primary};font-family:'Courier New',Courier,monospace;">${formatAmount(dashboardAmount)}</p>
                  </td>
                  <td width="50%" style="padding:14px 20px;">
                    <p style="margin:0 0 3px;font-size:10px;font-weight:600;color:${COLORS.textMuted};letter-spacing:0.08em;text-transform:uppercase;">Monto Analista</p>
                    <p style="margin:0;font-size:15px;font-weight:700;color:${COLORS.primary};font-family:'Courier New',Courier,monospace;">${formatAmount(analystAmount)}</p>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:14px 20px;background-color:#FEF2F2;border-top:1px solid ${COLORS.border};">
                    <p style="margin:0 0 3px;font-size:10px;font-weight:600;color:${COLORS.textMuted};letter-spacing:0.08em;text-transform:uppercase;">Diferencia Calculada</p>
                    <p style="margin:0;font-size:18px;font-weight:800;color:${differenceColor};font-family:'Courier New',Courier,monospace;">${formatAmount(difference)}</p>
                  </td>
                </tr>
                ` : ""}

              </table>

              <!-- Description -->
              <div style="background-color:${COLORS.bg};border:1px solid ${COLORS.border};border-radius:8px;padding:16px 20px;margin-bottom:24px;">
                <p style="margin:0 0 6px;font-size:10px;font-weight:600;color:${COLORS.textMuted};letter-spacing:0.08em;text-transform:uppercase;">Descripción del Analista</p>
                <p style="margin:0;font-size:14px;color:${COLORS.textBody};line-height:1.6;">${description}</p>
                ${dataSource ? `
                <p style="margin:10px 0 0;font-size:12px;color:${COLORS.textMuted};">
                  <strong>Fuente:</strong> ${dataSource}
                </p>` : ""}
              </div>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a
                      href="${ticketUrl}"
                      style="display:inline-block;background-color:${COLORS.primary};color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:14px 36px;border-radius:8px;"
                    >
                      Ver Ticket en el Dashboard →
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid ${COLORS.border};margin:0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;text-align:center;">
              <p style="margin:0 0 8px;font-size:12px;color:${COLORS.textMuted};line-height:1.6;">
                Este correo fue generado automáticamente por el sistema de tickets de discrepancias.<br/>
                Para gestionar este ticket, ingresa al dashboard con tu cuenta de administrador.
              </p>
              <p style="margin:0;font-size:11px;color:${COLORS.textMuted};">
                &copy; ${year} Flora &amp; Fauna &middot; Dashboard de Ventas
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

export interface TicketNotificationEmailParams {
  ticketId: number;
  module: string;
  dateFrom: string;
  dateTo: string;
  storeName: string;
  reportedByName: string;
  priority: string;
  description: string;
  dashboardAmount?: number | null;
  analystAmount?: number | null;
  difference?: number | null;
  dataSource?: string | null;
  appUrl: string;
  /** List of admin recipients */
  recipients: Array<{ name: string | null; email: string }>;
}

/**
 * Sends a discrepancy ticket notification email to all admin recipients via Brevo.
 * Returns the number of emails successfully sent.
 */
export async function sendTicketNotificationEmail(
  params: TicketNotificationEmailParams
): Promise<number> {
  const apiKey = ENV.brevoApiKey;

  if (!apiKey) {
    console.warn("[Email] BREVO_API_KEY not set — skipping ticket notification email");
    return 0;
  }

  if (!params.recipients.length) {
    console.warn("[Email] No admin recipients with email — skipping ticket notification");
    return 0;
  }

  const html = buildTicketNotificationEmailHtml(params);
  const client = new BrevoClient({ apiKey });
  let sent = 0;

  for (const recipient of params.recipients) {
    try {
      await client.transactionalEmails.sendTransacEmail({
        subject: `🚨 Ticket #${params.ticketId} – Discrepancia en ${MODULE_LABELS[params.module] ?? params.module} [${PRIORITY_CONFIG[params.priority]?.label ?? params.priority}]`,
        htmlContent: html,
        sender: {
          name: "Flora & Fauna · Dashboard",
          email: "portaldeventas@florayfauna.pe",
        },
        to: [
          {
            email: recipient.email,
            name: recipient.name ?? "Administrador",
          },
        ],
        replyTo: {
          email: "soporte@florayfauna.pe",
          name: "Soporte Flora & Fauna",
        },
      });
      sent++;
      console.log(`[Email] Ticket #${params.ticketId} notification sent to ${recipient.email}`);
    } catch (error: any) {
      console.error(
        `[Email] Failed to send ticket notification to ${recipient.email}:`,
        error?.message ?? error
      );
    }
  }

  return sent;
}

// ---------------------------------------------------------------------------
// Account Activation Email
// ---------------------------------------------------------------------------

/**
 * Generates the account activation email HTML with Flora & Fauna branding.
 * Replaces the old welcome email that included credentials in plain text.
 * Instead, it sends a secure one-time link to the activation page.
 */
function buildActivationEmailHtml(params: {
  name: string;
  username: string;
  activationUrl: string;
  role: string;
  requiresPasswordReset?: boolean;
}): string {
  const { name, username, activationUrl, role, requiresPasswordReset = false } = params;
  const roleLabels: Record<string, string> = {
    system_specialist: "Especialista de Sistemas",
    cst_user: "Usuario CST",
    store_user: "Usuario Tienda",
  };
  const roleLabel = roleLabels[role] ?? role;
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Activa tu cuenta – Flora &amp; Fauna Dashboard</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.bg};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.bg};min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Email card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:${COLORS.card};border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(37,35,37,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:${COLORS.primary};padding:32px 40px;text-align:center;">
              <img
                src="${LOGO_DARK_URL}"
                alt="Flora &amp; Fauna"
                width="181"
                height="19"
                style="display:block;margin:0 auto;filter:invert(1) brightness(2);"
              />
              <p style="margin:16px 0 0;color:#C8C4BE;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;font-weight:500;">
                Dashboard de Ventas
              </p>
            </td>
          </tr>

          <!-- Decorative stripe -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,${COLORS.accent} 0%,#80C8CA 50%,${COLORS.accent} 100%);"></td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">

              <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:${COLORS.primary};letter-spacing:-0.02em;">
                ¡Bienvenido, ${name}!
              </h1>
              <p style="margin:0 0 28px;font-size:15px;color:${COLORS.textMuted};line-height:1.6;">
                Tu cuenta ha sido creada en el <strong style="color:${COLORS.textBody};">Dashboard de Ventas Flora &amp; Fauna</strong>.
                ${requiresPasswordReset
                  ? "Se solicitó un reinicio de contraseña. Usa el enlace seguro para definir una contraseña nueva."
                  : "Para activarla y establecer tu contraseña definitiva, haz clic en el botón a continuación."}
              </p>

              <!-- Role badge — Esmeralda claro (activo) -->
              <div style="display:inline-block;background-color:${COLORS.accentLight};border:1px solid #A0D4C8;border-radius:20px;padding:4px 14px;margin-bottom:28px;">
                <span style="font-size:12px;font-weight:600;color:${COLORS.accent};letter-spacing:0.08em;text-transform:uppercase;">
                  ${roleLabel}
                </span>
              </div>

              <!-- Username info card -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.bg};border:1px solid ${COLORS.border};border-radius:10px;margin-bottom:28px;overflow:hidden;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:${COLORS.textMuted};letter-spacing:0.08em;text-transform:uppercase;">Tu nombre de usuario</p>
                    <p style="margin:0;font-size:16px;font-weight:700;color:${COLORS.primary};font-family:'Courier New',Courier,monospace;letter-spacing:0.04em;">${username}</p>
                  </td>
                </tr>
              </table>

              <!-- Steps -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                <tr>
                  <td style="padding:0 0 12px;">
                    <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:${COLORS.primary};text-transform:uppercase;letter-spacing:0.06em;">Pasos para activar tu cuenta:</p>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:6px 0;">
                          <span style="display:inline-block;width:22px;height:22px;background-color:${COLORS.accent};border-radius:50%;text-align:center;line-height:22px;font-size:12px;font-weight:700;color:#fff;margin-right:10px;vertical-align:middle;">1</span>
                          <span style="font-size:14px;color:${COLORS.textBody};vertical-align:middle;">Haz clic en el botón de activación</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;">
                          <span style="display:inline-block;width:22px;height:22px;background-color:${COLORS.accent};border-radius:50%;text-align:center;line-height:22px;font-size:12px;font-weight:700;color:#fff;margin-right:10px;vertical-align:middle;">2</span>
                          <span style="font-size:14px;color:${COLORS.textBody};vertical-align:middle;">${requiresPasswordReset
                            ? "El enlace de un solo uso te permitirá establecer una contraseña nueva"
                            : "Ingresa tu nombre de usuario y la contraseña temporal que te proporcionaron"}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;">
                          <span style="display:inline-block;width:22px;height:22px;background-color:${COLORS.accent};border-radius:50%;text-align:center;line-height:22px;font-size:12px;font-weight:700;color:#fff;margin-right:10px;vertical-align:middle;">3</span>
                          <span style="font-size:14px;color:${COLORS.textBody};vertical-align:middle;">Crea tu nueva contraseña segura</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a
                      href="${activationUrl}"
                      style="display:inline-block;background-color:${COLORS.primary};color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;padding:16px 44px;border-radius:8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"
                    >
                      Activar mi cuenta →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiry notice — Mostaza claro (advertencia) -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
                <tr>
                  <td style="background-color:${COLORS.mostazaLight};border:1px solid #E8D080;border-radius:8px;padding:14px 18px;">
                    <p style="margin:0;font-size:13px;color:#624C02;line-height:1.5;">
                      <strong style="color:${COLORS.mostaza};">&#9200; Este enlace expira en 48 horas.</strong> Si no activas tu cuenta en ese tiempo,
                      contacta al administrador para obtener un nuevo enlace.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Fallback URL -->
              <p style="margin:0;font-size:12px;color:${COLORS.textMuted};line-height:1.6;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:<br/>
                <a href="${activationUrl}" style="color:${COLORS.accent};word-break:break-all;">${activationUrl}</a>
              </p>

            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid ${COLORS.border};margin:0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;text-align:center;">
              <p style="margin:0 0 8px;font-size:12px;color:${COLORS.textMuted};line-height:1.6;">
                Este correo fue generado automáticamente por el sistema de gestión de usuarios.<br/>
                Si no solicitaste esta cuenta, por favor ignora este mensaje o contacta al administrador.
              </p>
              <p style="margin:0;font-size:11px;color:${COLORS.textMuted};">
                &copy; ${year} Flora &amp; Fauna &middot; Dashboard de Ventas
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

export interface ActivationEmailParams {
  /** Recipient full name */
  name: string;
  /** Recipient email address */
  email: string;
  /** Username for login */
  username: string;
  /** Full activation URL with token */
  activationUrl: string;
  /** User role */
  role: string;
  /** The link invalidates the prior password and lets the recipient set a new one directly. */
  requiresPasswordReset?: boolean;
}

/**
 * Sends an account activation email with a one-time link.
 * Replaces the old welcome email that exposed credentials in plain text.
 * Returns true on success, false if the API key is missing or the call fails.
 */
export async function sendActivationEmail(params: ActivationEmailParams): Promise<boolean> {
  const apiKey = ENV.brevoApiKey;

  if (!apiKey) {
    console.warn("[Email] BREVO_API_KEY not set — skipping activation email");
    return false;
  }

  if (!params.email) {
    console.warn("[Email] No email address provided — skipping activation email for user:", params.username);
    return false;
  }

  try {
    const client = new BrevoClient({ apiKey });

    await client.transactionalEmails.sendTransacEmail({
      subject: "Activa tu cuenta – Dashboard de Ventas Flora & Fauna",
      htmlContent: buildActivationEmailHtml({
        name: params.name,
        username: params.username,
        activationUrl: params.activationUrl,
        role: params.role,
        requiresPasswordReset: params.requiresPasswordReset,
      }),
      sender: {
        name: "Flora & Fauna · Dashboard",
        email: "portaldeventas@florayfauna.pe",
      },
      to: [
        {
          email: params.email,
          name: params.name,
        },
      ],
      replyTo: {
        email: "soporte@florayfauna.pe",
        name: "Soporte Flora & Fauna",
      },
    });

    console.log(`[Email] Activation email sent to ${params.email} (user: ${params.username})`);
    return true;
  } catch (error: any) {
    console.error("[Email] Failed to send activation email:", error?.message ?? error);
    return false;
  }
}

// ─── Trial / Subscription Email Functions ────────────────────────────────────

/** Envía aviso de que faltan 2 días para vencer el trial */
export async function sendTrialExpiryWarning(params: {
  to: string;
  name: string;
  trialEndDate: Date;
}): Promise<boolean> {
  const { to, name, trialEndDate } = params;
  const endDateStr = trialEndDate.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
  const year = new Date().getFullYear();

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><title>Tu período de prueba está por vencer</title></head>
<body style="margin:0;padding:0;background-color:${COLORS.bg};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.bg};min-height:100vh;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:${COLORS.accent};padding:0 40px;border-radius:12px 12px 0 0;text-align:center;">
          <img src="${LOGO_DARK_URL}" alt="Flora &amp; Fauna" style="height:36px;margin:24px 0;display:block;margin-left:auto;margin-right:auto;" />
        </td></tr>
        <tr><td style="background-color:${COLORS.card};padding:40px;border-radius:0 0 12px 12px;border:1px solid ${COLORS.border};">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${COLORS.primary};">Tu período de prueba está por vencer</h1>
          <p style="margin:0 0 24px;font-size:15px;color:${COLORS.textBody};line-height:1.6;">Hola <strong>${name}</strong>, tu acceso de prueba al Portal de Proveedores vence el <strong>${endDateStr}</strong>.</p>
          <p style="margin:0 0 24px;font-size:15px;color:${COLORS.textBody};line-height:1.6;">Para continuar accediendo, acepta los términos del servicio facturado antes de que expire tu período de prueba.</p>
          <p style="margin:32px 0 0;font-size:12px;color:${COLORS.textMuted};">© ${year} Flora &amp; Fauna. Todos los derechos reservados.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const apiKey = ENV.brevoApiKey;
  if (!apiKey) { console.warn("[Email] BREVO_API_KEY not set"); return false; }
  try {
    const client = new BrevoClient({ apiKey });
    await client.transactionalEmails.sendTransacEmail({
      sender: { name: "Flora & Fauna · Dashboard", email: "portaldeventas@florayfauna.pe" },
      to: [{ email: to, name }],
      subject: "⚠️ Tu período de prueba vence en 2 días",
      htmlContent: html,
    });
    return true;
  } catch (e) {
    console.error("[Email] sendTrialExpiryWarning failed:", e);
    return false;
  }
}

/** Envía confirmación al proveedor cuando acepta los términos */
export async function sendTermsAcceptedEmail(params: { to: string; name: string }): Promise<boolean> {
  const { to, name } = params;
  const year = new Date().getFullYear();

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/><title>Términos aceptados</title></head>
<body style="margin:0;padding:0;background-color:${COLORS.bg};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.bg};min-height:100vh;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:${COLORS.accent};padding:0 40px;border-radius:12px 12px 0 0;text-align:center;">
          <img src="${LOGO_DARK_URL}" alt="Flora &amp; Fauna" style="height:36px;margin:24px 0;display:block;margin-left:auto;margin-right:auto;" />
        </td></tr>
        <tr><td style="background-color:${COLORS.card};padding:40px;border-radius:0 0 12px 12px;border:1px solid ${COLORS.border};">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${COLORS.primary};">Términos aceptados correctamente</h1>
          <p style="margin:0 0 24px;font-size:15px;color:${COLORS.textBody};line-height:1.6;">Hola <strong>${name}</strong>, hemos registrado tu aceptación de los términos del servicio facturado. Tu acceso al Portal de Proveedores ha sido activado.</p>
          <p style="margin:32px 0 0;font-size:12px;color:${COLORS.textMuted};">© ${year} Flora &amp; Fauna. Todos los derechos reservados.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const apiKey = ENV.brevoApiKey;
  if (!apiKey) { console.warn("[Email] BREVO_API_KEY not set"); return false; }
  try {
    const client = new BrevoClient({ apiKey });
    await client.transactionalEmails.sendTransacEmail({
      sender: { name: "Flora & Fauna · Dashboard", email: "portaldeventas@florayfauna.pe" },
      to: [{ email: to, name }],
      subject: "✅ Acceso al servicio activado – Flora & Fauna",
      htmlContent: html,
    });
    return true;
  } catch (e) {
    console.error("[Email] sendTermsAcceptedEmail failed:", e);
    return false;
  }
}

/** Notifica a especialistas que un proveedor solicitó acceso facturado */
export async function sendAccessRequestedEmail(params: { userName: string; userEmail: string }): Promise<boolean> {
  const { userName, userEmail } = params;
  const { getSpecialistEmails } = await import("./db");
  const specialists = await getSpecialistEmails();
  if (!specialists.length) return false;

  const year = new Date().getFullYear();
  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/><title>Solicitud de acceso facturado</title></head>
<body style="margin:0;padding:0;background-color:${COLORS.bg};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.bg};min-height:100vh;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:${COLORS.primary};padding:0 40px;border-radius:12px 12px 0 0;text-align:center;">
          <img src="${LOGO_DARK_URL}" alt="Flora &amp; Fauna" style="height:36px;margin:24px 0;display:block;margin-left:auto;margin-right:auto;" />
        </td></tr>
        <tr><td style="background-color:${COLORS.card};padding:40px;border-radius:0 0 12px 12px;border:1px solid ${COLORS.border};">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${COLORS.primary};">Solicitud de acceso al servicio facturado</h1>
          <p style="margin:0 0 24px;font-size:15px;color:${COLORS.textBody};line-height:1.6;">El proveedor <strong>${userName}</strong> (${userEmail}) ha solicitado activación del servicio facturado tras aceptar los términos y condiciones.</p>
          <p style="margin:0 0 24px;font-size:15px;color:${COLORS.textBody};line-height:1.6;">Ingresa al módulo de Monitoreo de Proveedores para aprobar o rechazar la solicitud.</p>
          <p style="margin:32px 0 0;font-size:12px;color:${COLORS.textMuted};">© ${year} Flora &amp; Fauna. Todos los derechos reservados.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const apiKey = ENV.brevoApiKey;
  if (!apiKey) { console.warn("[Email] BREVO_API_KEY not set"); return false; }
  try {
    const client = new BrevoClient({ apiKey });
    await client.transactionalEmails.sendTransacEmail({
      sender: { name: "Flora & Fauna · Dashboard", email: "portaldeventas@florayfauna.pe" },
      to: specialists.map((s) => ({ email: s.email, name: s.name ?? "Especialista" })),
      subject: `🔔 Solicitud de acceso facturado – ${userName}`,
      htmlContent: html,
    });
    return true;
  } catch (e) {
    console.error("[Email] sendAccessRequestedEmail failed:", e);
    return false;
  }
}

/** Notifica al proveedor que su solicitud de acceso fue aprobada */
export async function sendAccessApprovedEmail(params: { to: string; name: string }): Promise<boolean> {
  const { to, name } = params;
  const year = new Date().getFullYear();

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/><title>Acceso aprobado</title></head>
<body style="margin:0;padding:0;background-color:${COLORS.bg};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.bg};min-height:100vh;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:${COLORS.accent};padding:0 40px;border-radius:12px 12px 0 0;text-align:center;">
          <img src="${LOGO_DARK_URL}" alt="Flora &amp; Fauna" style="height:36px;margin:24px 0;display:block;margin-left:auto;margin-right:auto;" />
        </td></tr>
        <tr><td style="background-color:${COLORS.card};padding:40px;border-radius:0 0 12px 12px;border:1px solid ${COLORS.border};">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${COLORS.primary};">¡Tu acceso ha sido aprobado!</h1>
          <p style="margin:0 0 24px;font-size:15px;color:${COLORS.textBody};line-height:1.6;">Hola <strong>${name}</strong>, tu solicitud de acceso al servicio facturado del Portal de Proveedores ha sido aprobada. Ya puedes acceder con todas las funcionalidades disponibles.</p>
          <p style="margin:32px 0 0;font-size:12px;color:${COLORS.textMuted};">© ${year} Flora &amp; Fauna. Todos los derechos reservados.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const apiKey = ENV.brevoApiKey;
  if (!apiKey) { console.warn("[Email] BREVO_API_KEY not set"); return false; }
  try {
    const client = new BrevoClient({ apiKey });
    await client.transactionalEmails.sendTransacEmail({
      sender: { name: "Flora & Fauna · Dashboard", email: "portaldeventas@florayfauna.pe" },
      to: [{ email: to, name }],
      subject: "✅ Tu acceso al servicio ha sido aprobado – Flora & Fauna",
      htmlContent: html,
    });
    return true;
  } catch (e) {
    console.error("[Email] sendAccessApprovedEmail failed:", e);
    return false;
  }
}
