/**
 * trialAlertJob.ts
 * Job diario que detecta proveedores con trial a 2 días de vencer
 * y les envía un correo de aviso.
 *
 * Se ejecuta desde un callback diario autenticado por la plataforma.
 */
import { getDb } from "./db";
import { supplierTrialAlertDeliveries, supplierTrialAlertSchedules, users } from "../drizzle/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { sendTrialExpiryWarning } from "./email";

/** 09:00 en Lima (UTC-5), con segundos como exige la plataforma. */
export const TRIAL_EXPIRY_ALERT_CRON = "0 0 14 * * *";

export type TrialAlertRunResult = {
  checked: number;
  sent: number;
  failed: number;
  skipped: number;
};

export function getTrialExpiryWarningWindow(runAt: Date): { start: Date; end: Date } {
  const start = new Date(runAt);
  start.setUTCDate(start.getUTCDate() + 2);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

export function buildTrialAlertDeliveryKey(userId: number, trialEndDate: Date): string {
  return `trial-expiry-warning:${userId}:${trialEndDate.toISOString().slice(0, 10)}`;
}

/**
 * Ejecuta el job de alertas de trial.
 * Envía correo a proveedores cuyo trial vence en exactamente 2 días.
 */
export async function runTrialAlertJob(scheduleTaskUid: string, runAt = new Date()): Promise<TrialAlertRunResult> {
  const db = await getDb();
  if (!db) {
    throw new Error("Trial alert database not available");
  }

  const [schedule] = await db
    .select({ taskUid: supplierTrialAlertSchedules.scheduleCronTaskUid })
    .from(supplierTrialAlertSchedules)
    .where(eq(supplierTrialAlertSchedules.scheduleCronTaskUid, scheduleTaskUid))
    .limit(1);
  if (!schedule) {
    return { checked: 0, sent: 0, failed: 0, skipped: 1 };
  }

  const { start: windowStart, end: windowEnd } = getTrialExpiryWarningWindow(runAt);
  const result: TrialAlertRunResult = { checked: 0, sent: 0, failed: 0, skipped: 0 };

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
      return result;
    }

    result.checked = candidates.length;
    console.log(`[TrialAlertJob] Processing ${candidates.length} provider(s) expiring in 2 days.`);

    for (const user of candidates) {
      if (!user.email || !user.trialEndDate) {
        result.skipped += 1;
        continue;
      }
      const deliveryKey = buildTrialAlertDeliveryKey(user.id, new Date(user.trialEndDate));
      try {
        const [existing] = await db
          .select({ id: supplierTrialAlertDeliveries.id })
          .from(supplierTrialAlertDeliveries)
          .where(eq(supplierTrialAlertDeliveries.deliveryKey, deliveryKey))
          .limit(1);
        if (existing) {
          result.skipped += 1;
          continue;
        }

        await db.insert(supplierTrialAlertDeliveries).values({
          deliveryKey,
          scheduleCronTaskUid: schedule.taskUid,
          userId: user.id,
          recipientEmail: user.email.trim().toLowerCase(),
          trialEndDate: new Date(user.trialEndDate),
          status: "sending",
        });

        const delivered = await sendTrialExpiryWarning({
          to: user.email,
          name: user.name ?? "Proveedor",
          trialEndDate: new Date(user.trialEndDate),
        });
        if (delivered) {
          await db
            .update(supplierTrialAlertDeliveries)
            .set({ status: "sent", sentAt: new Date(), errorCode: null })
            .where(eq(supplierTrialAlertDeliveries.deliveryKey, deliveryKey));
          result.sent += 1;
        } else {
          await db
            .update(supplierTrialAlertDeliveries)
            .set({ status: "failed", errorCode: "SEND_FAILED" })
            .where(eq(supplierTrialAlertDeliveries.deliveryKey, deliveryKey));
          result.failed += 1;
        }
      } catch (e) {
        // La restricción única de deliveryKey gana ante reintentos simultáneos.
        // En ese caso no se vuelve a enviar el correo.
        result.skipped += 1;
        console.error("[TrialAlertJob] Delivery was skipped or failed.", e instanceof Error ? e.name : "unknown_error");
      }
    }
    return result;
  } catch (e) {
    console.error("[TrialAlertJob] Error running job:", e);
    throw e;
  }
}
