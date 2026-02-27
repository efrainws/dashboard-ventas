/**
 * Email helper using Brevo (ex-Sendinblue) transactional API v4.
 * Sends welcome emails to newly created users with their access credentials.
 */
import { BrevoClient } from "@getbrevo/brevo";
import { ENV } from "./_core/env";

// CDN URLs for Flora & Fauna logos
const LOGO_DARK_URL =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663237488769/yXNYDcQnGVpTzYUo.svg";

// Brand colors matching the dashboard design
const COLORS = {
  bg: "#F5F3EF",
  card: "#FFFFFF",
  primary: "#252325",
  accent: "#5C6B3A",
  accentLight: "#EEF1E6",
  border: "#E5E2DB",
  textMuted: "#6B6866",
  textBody: "#3D3B3C",
};

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
            <td style="height:4px;background:linear-gradient(90deg,${COLORS.accent} 0%,#8FA45A 50%,${COLORS.accent} 100%);"></td>
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

              <!-- Role badge -->
              <div style="display:inline-block;background-color:${COLORS.accentLight};border:1px solid #C8D4A8;border-radius:20px;padding:4px 14px;margin-bottom:28px;">
                <span style="font-size:12px;font-weight:600;color:${COLORS.accent};letter-spacing:0.06em;text-transform:uppercase;">
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
                  <td style="background-color:#FFF8EC;border:1px solid #F0D99A;border-radius:8px;padding:14px 18px;">
                    <p style="margin:0;font-size:13px;color:#7A5C00;line-height:1.5;">
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
              <p style="margin:0;font-size:11px;color:#A8A4A0;">
                © ${year} Flora &amp; Fauna · Dashboard de Ventas
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
  username: string;
  newPassword: string;
  appUrl: string;
  changedByAdmin: boolean;
}): string {
  const { name, username, newPassword, appUrl, changedByAdmin } = params;
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
                <div style="display:inline-block;background-color:#FFF8EC;border:1px solid #F0D99A;border-radius:50%;width:56px;height:56px;line-height:56px;font-size:26px;">
                  🔑
                </div>
              </div>

              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:${COLORS.primary};letter-spacing:-0.02em;text-align:center;">
                ${actionLabel}
              </h1>
              <p style="margin:0 0 28px;font-size:15px;color:${COLORS.textMuted};line-height:1.6;text-align:center;">
                Hola <strong style="color:${COLORS.textBody};">${name}</strong>, a continuación encontrarás tus nuevas credenciales de acceso.
              </p>

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
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:${COLORS.textMuted};letter-spacing:0.08em;text-transform:uppercase;">Nueva Contraseña</p>
                    <p style="margin:0;font-size:16px;font-weight:700;color:${COLORS.primary};font-family:'Courier New',Courier,monospace;letter-spacing:0.08em;">${newPassword}</p>
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
                  <td style="background-color:#FFF8EC;border:1px solid #F0D99A;border-radius:8px;padding:14px 18px;">
                    <p style="margin:0;font-size:13px;color:#7A5C00;line-height:1.5;">
                      <strong>⚠ Seguridad:</strong> Te recomendamos cambiar esta contraseña inmediatamente después de ingresar.
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
              <p style="margin:0;font-size:11px;color:#A8A4A0;">
                © ${year} Flora &amp; Fauna · Dashboard de Ventas
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
  /** Username for login */
  username: string;
  /** New plain-text password */
  newPassword: string;
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
    console.warn("[Email] No email address for user — skipping password reset email:", params.username);
    return false;
  }

  try {
    const client = new BrevoClient({ apiKey });

    await client.transactionalEmails.sendTransacEmail({
      subject: "Tu contraseña ha sido restablecida – Flora & Fauna Dashboard",
      htmlContent: buildPasswordResetEmailHtml({
        name: params.name,
        username: params.username,
        newPassword: params.newPassword,
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

    console.log(`[Email] Password reset email sent to ${params.email} (user: ${params.username})`);
    return true;
  } catch (error: any) {
    console.error("[Email] Failed to send password reset email:", error?.message ?? error);
    return false;
  }
}
