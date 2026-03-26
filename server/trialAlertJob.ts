/**
 * trialAlertJob.ts
 * Job diario que detecta proveedores con trial a 2 días de vencer
 * y les envía un correo de aviso.
 *
 * Se registra en server/_core/index.ts usando setInterval.
 */
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { sendTrialExpiryWarning } from "./email";

/**
 * Ejecuta el job de alertas de trial.
 * Envía correo a proveedores cuyo trial vence en exactamente 2 días.
 */
export async function runTrialAlertJob(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[TrialAlertJob] Database not available, skipping.");
    return;
  }

  const now = new Date();
  // Ventana: entre 2 días 0h y 2 días 23:59 desde ahora
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() + 2);
  windowStart.setHours(0, 0, 0, 0);

  const windowEnd = new Date(windowStart);
  windowEnd.setHours(23, 59, 59, 999);

  try {
    const candidates = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.role, "supplier_user"),
          eq(users.supplierStatus, "trial_active"),
          gte(users.trialEndDate, windowStart),
          lte(users.trialEndDate, windowEnd)
        )
      );

    if (!candidates.length) {
      console.log(`[TrialAlertJob] No providers with trial expiring in 2 days.`);
      return;
    }

    console.log(`[TrialAlertJob] Sending expiry warnings to ${candidates.length} provider(s).`);

    for (const user of candidates) {
      if (!user.email || !user.trialEndDate) continue;
      try {
        await sendTrialExpiryWarning({
          to: user.email,
          name: user.name ?? "Proveedor",
          trialEndDate: new Date(user.trialEndDate),
        });
        console.log(`[TrialAlertJob] Warning sent to ${user.email}`);
      } catch (e) {
        console.error(`[TrialAlertJob] Failed to send to ${user.email}:`, e);
      }
    }
  } catch (e) {
    console.error("[TrialAlertJob] Error running job:", e);
  }
}

/**
 * Registra el job para ejecutarse cada 24 horas.
 * Llama a esta función desde server/_core/index.ts al arrancar el servidor.
 */
export function scheduleTrialAlertJob(): void {
  const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 horas

  // Ejecutar inmediatamente al arrancar (para no perder el primer día)
  runTrialAlertJob().catch((e) => console.error("[TrialAlertJob] Initial run failed:", e));

  // Luego cada 24 horas
  setInterval(() => {
    runTrialAlertJob().catch((e) => console.error("[TrialAlertJob] Scheduled run failed:", e));
  }, INTERVAL_MS);

  console.log("[TrialAlertJob] Scheduled — runs every 24 hours.");
}
