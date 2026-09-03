import crypto from "crypto";

export const DOMAIN_CHANGE_NOTICE_SUBJECT = "Actualización de acceso al Dashboard de Ventas";
export const DOMAIN_CHANGE_NOTICE_SENDER = {
  name: "Flora & Fauna · Notificaciones",
  email: "notificaciones@florayfauna.pe",
};
export const DOMAIN_CHANGE_NOTICE_REPLY_TO = {
  name: "Soporte Flora & Fauna",
  email: "soporte@florayfauna.pe",
};

type RequestOrigin = {
  get(name: string): string | undefined;
  protocol?: string;
};

function firstHeaderValue(value: string | undefined): string {
  return (value ?? "").split(",")[0]?.trim() ?? "";
}

/**
 * Construye la URL desde el host de la solicitud publicada, nunca desde una entrada del cliente.
 * Las previsualizaciones locales se bloquean para impedir que un dominio de desarrollo llegue al correo.
 */
export function resolvePublishedDashboardUrl(req: RequestOrigin): string {
  const host = firstHeaderValue(req.get("x-forwarded-host") || req.get("host")).toLowerCase();
  const protocol = firstHeaderValue(req.get("x-forwarded-proto") || req.protocol).toLowerCase();

  const isUnsafeHost =
    !host ||
    host.includes("/") ||
    host.includes("\\") ||
    host.includes("@") ||
    host.includes("localhost") ||
    host.includes(".manus.computer") ||
    /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/.test(host);

  if (protocol !== "https" || isUnsafeHost) {
    throw new Error("Abre esta acción desde el dominio público HTTPS publicado para poder generar el aviso.");
  }

  return `https://${host}`;
}

export function createDomainChangeIdempotencyKey(publicUrl: string): string {
  return crypto.createHash("sha256").update(`domain-change:${publicUrl}`).digest("hex");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

export function buildDomainChangeNoticeText(params: { recipientName: string | null; publicUrl: string }): string {
  const name = params.recipientName?.trim() || "usuario";
  return [
    `Hola, ${name}:`,
    "",
    "Actualizamos la dirección de acceso al Dashboard de Ventas de Flora & Fauna.",
    `A partir de ahora, ingresa mediante: ${params.publicUrl}`,
    "",
    "Te recomendamos actualizar tus favoritos o marcadores para usar siempre la nueva dirección.",
    "",
    "Equipo de Flora & Fauna",
  ].join("\n");
}

export function buildDomainChangeNoticeHtml(params: { recipientName: string | null; publicUrl: string }): string {
  const name = escapeHtml(params.recipientName?.trim() || "usuario");
  const publicUrl = escapeHtml(params.publicUrl);
  const year = new Date().getFullYear();

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${DOMAIN_CHANGE_NOTICE_SUBJECT}</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f4f1;color:#232523;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f4f1;">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #eae8e2;">
          <tr><td style="padding:24px 32px;background:#232523;color:#ffffff;">
            <p style="margin:0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;">Flora &amp; Fauna</p>
            <h1 style="margin:10px 0 0;font-size:24px;line-height:1.2;">Nueva dirección de acceso</h1>
          </td></tr>
          <tr><td style="height:4px;background:#008064;"></td></tr>
          <tr><td style="padding:32px;">
            <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hola, <strong>${name}</strong>:</p>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">Actualizamos la dirección de acceso al <strong>Dashboard de Ventas</strong>. A partir de ahora, utiliza la siguiente URL:</p>
            <p style="margin:0 0 24px;padding:14px 16px;border-left:3px solid #008064;background:#f5f4f1;word-break:break-all;"><a href="${publicUrl}" style="color:#006a54;font-weight:700;text-decoration:none;">${publicUrl}</a></p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="background:#232523;padding:12px 20px;"><a href="${publicUrl}" style="color:#ffffff;font-size:14px;font-weight:700;letter-spacing:.04em;text-decoration:none;text-transform:uppercase;">Ingresar al Dashboard</a></td></tr></table>
            <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6d6d69;">Te recomendamos actualizar tus favoritos o marcadores para usar siempre la nueva dirección.</p>
          </td></tr>
          <tr><td style="padding:20px 32px;border-top:1px solid #eae8e2;color:#919291;font-size:12px;line-height:1.5;">Este es un aviso informativo de Flora &amp; Fauna. Si necesitas ayuda, responde a este correo.<br />© ${year} Flora &amp; Fauna</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
