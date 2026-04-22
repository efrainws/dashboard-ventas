"""
Script: send_login_change_notice.py
Propósito: Enviar un correo de anuncio del cambio al sistema de inicio de sesión
           (email en lugar de nombre de usuario) a todos los usuarios creados
           antes del 22 de abril de 2026 que tengan un email registrado.

Uso:
    python3 scripts/send_login_change_notice.py [--dry-run]

    --dry-run  Consulta y muestra los destinatarios pero NO envía correos.
"""

import os
import sys
import time
import logging
import argparse
from datetime import datetime
from urllib.parse import urlparse

import pymysql
import sib_api_v3_sdk
from sib_api_v3_sdk.rest import ApiException

# ── Configuración de logging ────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Constantes ───────────────────────────────────────────────────────────────
CUTOFF_DATE = datetime(2026, 4, 22, 0, 0, 0)   # Usuarios creados ANTES de esta fecha
APP_URL = "https://dashboard.florayfauna.pe"
SENDER_EMAIL = "portaldeventas@florayfauna.pe"
SENDER_NAME = "Flora & Fauna · Dashboard"
REPLY_TO_EMAIL = "soporte@florayfauna.pe"
SUBJECT = "Actualización importante: nuevo sistema de inicio de sesión"
RATE_LIMIT_DELAY = 0.3   # segundos entre envíos (≈ 200 correos/min, bajo el límite de Brevo)

# ── Paleta de colores Flora & Fauna ──────────────────────────────────────────
COLORS = {
    "bg": "#F5F4F1",
    "card": "#FFFFFF",
    "primary": "#232523",
    "accent": "#008064",
    "accentLight": "#E6F4F1",
    "granate": "#BC2C46",
    "granateLight": "#FAEAED",
    "cobalto": "#1A6894",
    "cobaltaLight": "#E8F1F7",
    "border": "#EAE8E2",
    "textMuted": "#919291",
    "textBody": "#232523",
}

LOGO_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663237488769/yXNYDcQnGVpTzYUo.svg"


# ── Plantilla HTML del correo ────────────────────────────────────────────────
def build_email_html(name: str, email: str, app_url: str) -> str:
    year = datetime.now().year
    c = COLORS
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Actualización del sistema de inicio de sesión – Flora &amp; Fauna</title>
</head>
<body style="margin:0;padding:0;background-color:{c['bg']};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{c['bg']};min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Email card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0"
          style="max-width:600px;width:100%;background-color:{c['card']};border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(37,35,37,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:{c['primary']};padding:32px 40px;text-align:center;">
              <img src="{LOGO_URL}" alt="Flora &amp; Fauna" width="181" height="19"
                style="display:block;margin:0 auto;filter:invert(1) brightness(2);" />
              <p style="margin:16px 0 0;color:#C8C4BE;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;font-weight:500;">
                Dashboard de Ventas
              </p>
            </td>
          </tr>

          <!-- Franja decorativa -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,{c['accent']} 0%,#80C8CA 50%,{c['accent']} 100%);"></td>
          </tr>

          <!-- Cuerpo -->
          <tr>
            <td style="padding:40px 40px 32px;">

              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:{c['primary']};letter-spacing:-0.02em;">
                Actualización en el sistema de inicio de sesión
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:{c['textMuted']};line-height:1.6;">
                Hola <strong style="color:{c['textBody']};">{name}</strong>,
              </p>
              <p style="margin:0 0 20px;font-size:15px;color:{c['textBody']};line-height:1.7;">
                Te informamos que hemos actualizado el sistema de acceso al
                <strong>Dashboard de Ventas Flora &amp; Fauna</strong>.
                A partir de ahora, el inicio de sesión se realiza con tu
                <strong>correo electrónico</strong> en lugar de tu nombre de usuario.
              </p>

              <!-- Cambio destacado -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                style="background-color:{c['bg']};border:1px solid {c['border']};border-radius:10px;margin-bottom:28px;overflow:hidden;">
                <tr>
                  <td style="padding:18px 24px;border-bottom:1px solid {c['border']};">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:{c['textMuted']};letter-spacing:0.08em;text-transform:uppercase;">
                      Antes
                    </p>
                    <p style="margin:0;font-size:14px;color:{c['granate']};font-weight:500;">
                      Nombre de usuario (username)
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 24px;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:{c['textMuted']};letter-spacing:0.08em;text-transform:uppercase;">
                      Ahora
                    </p>
                    <p style="margin:0;font-size:14px;color:{c['accent']};font-weight:600;">
                      Correo electrónico: {email}
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 28px;font-size:15px;color:{c['textBody']};line-height:1.7;">
                Tu contraseña permanece igual. Si no recuerdas tu contraseña, contacta al
                administrador del sistema para que te genere una nueva.
              </p>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="{app_url}"
                      style="display:inline-block;background-color:{c['primary']};color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:14px 36px;border-radius:8px;">
                      Ingresar al Dashboard →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Nota informativa -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color:{c['cobaltaLight']};border:1px solid #B8D4E8;border-radius:8px;padding:14px 18px;">
                    <p style="margin:0;font-size:13px;color:#124A6B;line-height:1.5;">
                      <strong>ℹ Información:</strong> Si tienes alguna dificultad para acceder,
                      escríbenos a <a href="mailto:{REPLY_TO_EMAIL}" style="color:{c['cobalto']};font-weight:600;">{REPLY_TO_EMAIL}</a>
                      y te ayudaremos a restablecer tu acceso.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Divisor -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid {c['border']};margin:0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;text-align:center;">
              <p style="margin:0 0 8px;font-size:12px;color:{c['textMuted']};line-height:1.6;">
                Este correo fue generado automáticamente por el sistema de gestión de usuarios.<br/>
                Si no tienes una cuenta en el Dashboard de Ventas, por favor ignora este mensaje.
              </p>
              <p style="margin:0;font-size:11px;color:{c['textMuted']};">
                &copy; {year} Flora &amp; Fauna &middot; Dashboard de Ventas
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>"""


# ── Conexión a MySQL ─────────────────────────────────────────────────────────
def get_db_connection():
    """Parsea DATABASE_URL y retorna una conexión pymysql."""
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        raise RuntimeError("DATABASE_URL no está definida en el entorno.")

    parsed = urlparse(db_url)
    return pymysql.connect(
        host=parsed.hostname,
        port=parsed.port or 3306,
        user=parsed.username,
        password=parsed.password,
        database=parsed.path.lstrip("/"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        ssl={"ssl": True} if "ssl" in db_url.lower() else None,
    )


# ── Consulta de usuarios elegibles ──────────────────────────────────────────
def fetch_eligible_users(conn) -> list[dict]:
    """
    Retorna todos los usuarios con email registrado creados antes del 22/04/2026.
    Excluye registros sin email o con email vacío.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, email, role, createdAt
            FROM users
            WHERE createdAt < %s
              AND email IS NOT NULL
              AND email != ''
            ORDER BY createdAt ASC
            """,
            (CUTOFF_DATE,),
        )
        return cur.fetchall()


# ── Envío de correos ─────────────────────────────────────────────────────────
def send_emails(users: list[dict], dry_run: bool = False) -> dict:
    """
    Envía el correo de anuncio a cada usuario de la lista.
    Retorna un resumen con contadores de éxito, error y omitidos.
    """
    api_key = os.environ.get("BREVO_API_KEY", "")
    if not api_key:
        raise RuntimeError("BREVO_API_KEY no está definida en el entorno.")

    configuration = sib_api_v3_sdk.Configuration()
    configuration.api_key["api-key"] = api_key
    api_instance = sib_api_v3_sdk.TransactionalEmailsApi(
        sib_api_v3_sdk.ApiClient(configuration)
    )

    results = {"sent": 0, "failed": 0, "skipped": 0, "errors": []}

    for i, user in enumerate(users, start=1):
        name = user.get("name") or "Usuario"
        email = user.get("email", "").strip()

        if not email:
            log.warning("[%d/%d] Usuario id=%s sin email — omitido", i, len(users), user["id"])
            results["skipped"] += 1
            continue

        log.info(
            "[%d/%d] %s → %s (rol: %s, creado: %s)",
            i, len(users), name, email, user.get("role"), user.get("createdAt")
        )

        if dry_run:
            log.info("  [DRY-RUN] Correo NO enviado.")
            results["sent"] += 1
            continue

        html_content = build_email_html(name, email, APP_URL)

        send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
            sender={"name": SENDER_NAME, "email": SENDER_EMAIL},
            to=[{"email": email, "name": name}],
            reply_to={"email": REPLY_TO_EMAIL, "name": "Soporte Flora & Fauna"},
            subject=SUBJECT,
            html_content=html_content,
        )

        try:
            api_instance.send_transac_email(send_smtp_email)
            log.info("  ✓ Enviado correctamente.")
            results["sent"] += 1
        except ApiException as e:
            log.error("  ✗ Error Brevo API: %s", e)
            results["failed"] += 1
            results["errors"].append({"email": email, "error": str(e)})
        except Exception as e:
            log.error("  ✗ Error inesperado: %s", e)
            results["failed"] += 1
            results["errors"].append({"email": email, "error": str(e)})

        # Respetar el rate limit de Brevo
        time.sleep(RATE_LIMIT_DELAY)

    return results


# ── Punto de entrada ─────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="Envía correo de anuncio de cambio de login a usuarios elegibles."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Consulta y muestra destinatarios sin enviar correos.",
    )
    args = parser.parse_args()

    mode = "DRY-RUN" if args.dry_run else "PRODUCCIÓN"
    log.info("=== Inicio del envío masivo — Modo: %s ===", mode)
    log.info("Fecha de corte: %s", CUTOFF_DATE.strftime("%Y-%m-%d"))

    # 1. Conectar a la base de datos
    try:
        conn = get_db_connection()
        log.info("Conexión a MySQL establecida.")
    except Exception as e:
        log.error("No se pudo conectar a la base de datos: %s", e)
        sys.exit(1)

    # 2. Obtener usuarios elegibles
    try:
        users = fetch_eligible_users(conn)
    finally:
        conn.close()

    if not users:
        log.info("No se encontraron usuarios elegibles. Fin del proceso.")
        sys.exit(0)

    log.info("Usuarios elegibles encontrados: %d", len(users))

    # 3. Mostrar tabla de destinatarios
    log.info("─" * 70)
    log.info("%-4s %-30s %-35s %-20s", "ID", "Nombre", "Email", "Rol")
    log.info("─" * 70)
    for u in users:
        log.info(
            "%-4s %-30s %-35s %-20s",
            u["id"],
            (u.get("name") or "—")[:29],
            (u.get("email") or "—")[:34],
            u.get("role", "—"),
        )
    log.info("─" * 70)

    # 4. Enviar correos
    results = send_emails(users, dry_run=args.dry_run)

    # 5. Resumen final
    log.info("=== Resumen del envío ===")
    log.info("  Enviados exitosamente : %d", results["sent"])
    log.info("  Fallidos              : %d", results["failed"])
    log.info("  Omitidos (sin email)  : %d", results["skipped"])

    if results["errors"]:
        log.warning("Detalle de errores:")
        for err in results["errors"]:
            log.warning("  - %s: %s", err["email"], err["error"])

    if results["failed"] > 0:
        sys.exit(1)
    else:
        log.info("Proceso completado sin errores.")
        sys.exit(0)


if __name__ == "__main__":
    main()
