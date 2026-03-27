import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  DiscrepancyTicket, discrepancyTickets, InsertDiscrepancyTicket,
  InsertUser, users,
  termsVersions, termsAcceptance, TermsVersion, TermsAcceptance,
  SupplierStatus,
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { pool } from './postgres';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      // El owner siempre es Especialista de Sistemas
      values.role = 'system_specialist';
      updateSet.role = 'system_specialist';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(userId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.id, parseInt(userId))).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserLastSignIn(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update user: database not available");
    return;
  }

  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
}

// ─── Discrepancy Tickets ────────────────────────────────────────────────────

export async function createDiscrepancyTicket(
  data: InsertDiscrepancyTicket
): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(discrepancyTickets).values(data);
  return { id: (result[0] as any).insertId };
}

export async function getDiscrepancyTickets(filters?: {
  status?: DiscrepancyTicket["status"];
  module?: string;
  limit?: number;
  offset?: number;
}): Promise<DiscrepancyTicket[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.status) conditions.push(eq(discrepancyTickets.status, filters.status));
  if (filters?.module) conditions.push(eq(discrepancyTickets.module, filters.module));

  const query = db
    .select()
    .from(discrepancyTickets)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(discrepancyTickets.createdAt))
    .limit(filters?.limit ?? 100)
    .offset(filters?.offset ?? 0);

  return query;
}

export async function getDiscrepancyTicketById(
  id: number
): Promise<DiscrepancyTicket | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(discrepancyTickets)
    .where(eq(discrepancyTickets.id, id))
    .limit(1);

  return result[0];
}

export async function updateDiscrepancyTicketStatus(
  id: number,
  status: DiscrepancyTicket["status"],
  resolvedById?: number,
  resolvedByName?: string,
  resolutionNotes?: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: Partial<DiscrepancyTicket> = { status };
  if (resolvedById) updateData.resolvedById = resolvedById;
  if (resolvedByName) updateData.resolvedByName = resolvedByName;
  if (resolutionNotes) updateData.resolutionNotes = resolutionNotes;

  await db
    .update(discrepancyTickets)
    .set(updateData)
    .where(eq(discrepancyTickets.id, id));
}

export async function countDiscrepancyTickets(filters?: {
  status?: DiscrepancyTicket["status"];
}): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const conditions = [];
  if (filters?.status) conditions.push(eq(discrepancyTickets.status, filters.status));

  const result = await db
    .select({ count: discrepancyTickets.id })
    .from(discrepancyTickets)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return result.length;
}

/**
 * Returns the list of system_specialist users that have an email address configured.
 * Used to send ticket notification emails.
 */
export async function getAdminEmails(): Promise<Array<{ name: string | null; email: string }>> {
  const db = await getDb();
  if (!db) return [];

  const admins = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.role, "system_specialist"));

  return admins.filter((a): a is { name: string | null; email: string } => !!a.email);
}

// ─── Supplier Trial / Subscription Helpers ──────────────────────────────────

/**
 * Calcula el estado efectivo del proveedor basado en fechas y estado almacenado.
 * Actualiza automáticamente trial_active → trial_expired si el trial venció.
 */
export function computeSupplierStatus(user: {
  supplierStatus: string | null;
  activationDate: Date | null;
  trialEndDate: Date | null;
}): SupplierStatus | null {
  // pending_activation: cuenta creada pero aún no activada por el usuario
  if (user.supplierStatus === "pending_activation") return "pending_activation";
  if (!user.supplierStatus) return null;
  if (
    user.supplierStatus === "trial_active" &&
    user.trialEndDate &&
    new Date() > user.trialEndDate
  ) {
    return "trial_expired";
  }
  return user.supplierStatus as SupplierStatus;
}

/** Obtiene todos los usuarios proveedor con su estado efectivo calculado */
export async function getSupplierUsers(filters?: {
  status?: SupplierStatus;
}): Promise<Array<typeof users.$inferSelect & { effectiveStatus: SupplierStatus | null; supplierRuc: string | null; supplierName: string | null }>> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(users.role, "supplier_user")];
  const rows = await db.select().from(users).where(and(...conditions)).orderBy(desc(users.createdAt));

  // Enriquecer con RUC y nombre del proveedor desde PostgreSQL (una sola consulta)
  const supplierIds = Array.from(
    new Set(rows.filter((u) => u.assignedSupplierId).map((u) => u.assignedSupplierId as string))
  );

  let supplierMap: Record<string, { ruc: string; name: string }> = {};
  if (supplierIds.length > 0) {
    try {
      const placeholders = supplierIds.map((_, i) => `$${i + 1}`).join(", ");
      const result = await pool.query(
        `SELECT id::text, ruc, name FROM public.suppliers WHERE id::text IN (${placeholders})`,
        supplierIds
      );
      for (const row of result.rows) {
        supplierMap[String(row.id)] = { ruc: row.ruc, name: row.name };
      }
    } catch (pgErr) {
      console.warn("[getSupplierUsers] Could not enrich supplier data:", pgErr);
    }
  }

  const withStatus = rows.map((u) => {
    const sup = u.assignedSupplierId ? supplierMap[u.assignedSupplierId] : undefined;
    return {
      ...u,
      effectiveStatus: computeSupplierStatus(u),
      supplierRuc: sup?.ruc ?? null,
      supplierName: sup?.name ?? null,
    };
  });

  if (filters?.status) {
    return withStatus.filter((u) => u.effectiveStatus === filters.status);
  }
  return withStatus;
}

/** Activa el trial de un usuario proveedor (establece activationDate y trialEndDate) */
export async function activateSupplierTrial(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + 7);

  await db.update(users).set({
    supplierStatus: "trial_active",
    activationDate: now,
    trialEndDate: trialEnd,
  }).where(eq(users.id, userId));
}

/** Registra la aceptación de términos y cambia el estado a subscribed_active */
export async function acceptTerms(params: {
  userId: number;
  termsVersionId: number;
  ip: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();

  // Registrar en terms_acceptance
  await db.insert(termsAcceptance).values({
    userId: params.userId,
    termsVersionId: params.termsVersionId,
    acceptedAt: now,
    ip: params.ip,
  });

  // Actualizar usuario
  await db.update(users).set({
    supplierStatus: "subscribed_active",
    termsVersionId: params.termsVersionId,
    termsAcceptedAt: now,
    termsAcceptedIp: params.ip,
    subscriptionStartDate: now,
  }).where(eq(users.id, params.userId));
}

/**
 * Registra la aceptación de términos sin cambiar el supplierStatus.
 * Usado durante la activación de cuenta de usuarios subscribed_active.
 */
export async function recordTermsAcceptanceOnly(params: {
  userId: number;
  termsVersionId: number;
  ip: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();

  // Registrar en terms_acceptance
  await db.insert(termsAcceptance).values({
    userId: params.userId,
    termsVersionId: params.termsVersionId,
    acceptedAt: now,
    ip: params.ip,
  });

  // Actualizar solo los campos de T&C en el usuario (sin cambiar supplierStatus)
  await db.update(users).set({
    termsVersionId: params.termsVersionId,
    termsAcceptedAt: now,
    termsAcceptedIp: params.ip,
  }).where(eq(users.id, params.userId));
}

/** Registra solicitud de acceso facturado (trial_expired → access_requested) */
export async function requestPaidAccess(params: {
  userId: number;
  termsVersionId: number;
  ip: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();

  await db.insert(termsAcceptance).values({
    userId: params.userId,
    termsVersionId: params.termsVersionId,
    acceptedAt: now,
    ip: params.ip,
  });

  await db.update(users).set({
    supplierStatus: "access_requested",
    termsVersionId: params.termsVersionId,
    termsAcceptedAt: now,
    termsAcceptedIp: params.ip,
  }).where(eq(users.id, params.userId));
}

/** Aprueba la solicitud de acceso facturado (access_requested → subscribed_active) */
export async function approveAccessRequest(params: {
  userId: number;
  approvedById: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();

  await db.update(users).set({
    supplierStatus: "subscribed_active",
    subscriptionStartDate: now,
    approvedById: params.approvedById,
    approvedAt: now,
  }).where(eq(users.id, params.userId));
}

/** Cambia el estado de un usuario proveedor manualmente */
export async function setSupplierStatus(userId: number, status: SupplierStatus): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(users).set({ supplierStatus: status }).where(eq(users.id, userId));
}

// ─── Terms Versions Helpers ──────────────────────────────────────────────────

/** Obtiene la versión de términos activa */
export async function getActiveTermsVersion(): Promise<TermsVersion | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(termsVersions)
    .where(eq(termsVersions.isActive, 1))
    .limit(1);

  return result[0];
}

/** Obtiene todas las versiones de términos */
export async function getAllTermsVersions(): Promise<TermsVersion[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(termsVersions).orderBy(desc(termsVersions.createdAt));
}

/** Crea una nueva versión de términos y la activa (desactiva las anteriores) */
export async function createTermsVersion(data: {
  version: string;
  content: string;
}): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Desactivar versiones anteriores
  await db.update(termsVersions).set({ isActive: 0 });

  const result = await db.insert(termsVersions).values({
    version: data.version,
    content: data.content,
    isActive: 1,
  });

  return { id: (result[0] as any).insertId };
}

/** Obtiene el historial de aceptaciones de términos de un usuario */
export async function getUserTermsAcceptance(userId: number): Promise<TermsAcceptance[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(termsAcceptance)
    .where(eq(termsAcceptance.userId, userId))
    .orderBy(desc(termsAcceptance.acceptedAt));
}

/** Obtiene usuarios proveedor para el reporte de afiliación */
export async function getAffiliationReport(): Promise<Array<{
  id: number;
  name: string | null;
  email: string | null;
  assignedSupplierId: string | null;
  supplierRuc: string | null;
  supplierName: string | null;
  activationDate: Date | null;
  subscriptionStartDate: Date | null;
  supplierStatus: SupplierStatus | null;
  effectiveStatus: SupplierStatus | null;
  primerMes: boolean;
  porcentajeCobro: number | null;
}>> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(users)
    .where(eq(users.role, "supplier_user"))
    .orderBy(users.name);

  // Enriquecer con RUC y nombre del proveedor desde PostgreSQL (una sola consulta)
  const supplierIds = Array.from(
    new Set(rows.filter((u) => u.assignedSupplierId).map((u) => u.assignedSupplierId as string))
  );

  let supplierMap: Record<string, { ruc: string; name: string }> = {};
  if (supplierIds.length > 0) {
    try {
      const placeholders = supplierIds.map((_, i) => `$${i + 1}`).join(", ");
      const result = await pool.query(
        `SELECT id::text, ruc, name FROM public.suppliers WHERE id::text IN (${placeholders})`,
        supplierIds
      );
      for (const row of result.rows) {
        supplierMap[String(row.id)] = { ruc: row.ruc, name: row.name };
      }
    } catch (pgErr) {
      console.warn("[getAffiliationReport] Could not enrich supplier data:", pgErr);
    }
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  return rows.map((u) => {
    const effectiveStatus = computeSupplierStatus(u);
    const sup = u.assignedSupplierId ? supplierMap[u.assignedSupplierId] : undefined;
    let primerMes = false;
    let porcentajeCobro: number | null = null;

    if (u.subscriptionStartDate) {
      const sd = new Date(u.subscriptionStartDate);
      primerMes = sd.getFullYear() === currentYear && sd.getMonth() === currentMonth;

      // Días desde subscription_start_date hasta fin de mes / total días del mes
      const endOfMonth = new Date(currentYear, currentMonth + 1, 0); // último día del mes
      const totalDays = endOfMonth.getDate();
      const daysRemaining = endOfMonth.getDate() - sd.getDate() + 1;
      porcentajeCobro = Math.min(1, Math.max(0, daysRemaining / totalDays));
    }

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      assignedSupplierId: u.assignedSupplierId,
      supplierRuc: sup?.ruc ?? null,
      supplierName: sup?.name ?? null,
      activationDate: u.activationDate,
      subscriptionStartDate: u.subscriptionStartDate,
      supplierStatus: u.supplierStatus as SupplierStatus | null,
      effectiveStatus,
      primerMes,
      porcentajeCobro,
    };
  });
}

/** Obtiene usuarios especialistas (commercial_specialist y systems_specialist) con email */
export async function getSpecialistEmails(): Promise<Array<{ name: string | null; email: string }>> {
  const db = await getDb();
  if (!db) return [];

  const specialists = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(
      and(
        // commercial_specialist or system_specialist
        eq(users.role, "commercial_specialist")
      )
    );

  const systemSpecialists = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.role, "system_specialist"));

  return [...specialists, ...systemSpecialists].filter(
    (u): u is { name: string | null; email: string } => !!u.email
  );
}

/** Actualiza el contenido y/o versión de un T&C existente */
export async function updateTermsVersion(data: {
  id: number;
  version?: string;
  content?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: Record<string, unknown> = {};
  if (data.version !== undefined) updateData.version = data.version;
  if (data.content !== undefined) updateData.content = data.content;

  if (Object.keys(updateData).length === 0) return;

  await db.update(termsVersions).set(updateData).where(eq(termsVersions.id, data.id));
}

/** Activa una versión de T&C y desactiva las demás */
export async function setActiveTermsVersion(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Desactivar todas
  await db.update(termsVersions).set({ isActive: 0 });
  // Activar la seleccionada
  await db.update(termsVersions).set({ isActive: 1 }).where(eq(termsVersions.id, id));
}

/** Elimina una versión de T&C (solo si no tiene aceptaciones) */
export async function deleteTermsVersion(id: number): Promise<{ deleted: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Verificar si tiene aceptaciones
  const acceptances = await db
    .select({ id: termsAcceptance.id })
    .from(termsAcceptance)
    .where(eq(termsAcceptance.termsVersionId, id))
    .limit(1);

  if (acceptances.length > 0) {
    return { deleted: false, reason: "Esta versión tiene aceptaciones registradas y no puede eliminarse" };
  }

  await db.delete(termsVersions).where(eq(termsVersions.id, id));
  return { deleted: true };
}

/** Obtiene todas las versiones de T&C con conteo de aceptaciones */
export async function getAllTermsVersionsWithCount(): Promise<Array<TermsVersion & { acceptanceCount: number }>> {
  const db = await getDb();
  if (!db) return [];

  const versions = await db.select().from(termsVersions).orderBy(desc(termsVersions.createdAt));

  // Contar aceptaciones por versión en una sola consulta
  const counts = await db
    .select({
      termsVersionId: termsAcceptance.termsVersionId,
      count: sql<number>`COUNT(*)`,
    })
    .from(termsAcceptance)
    .groupBy(termsAcceptance.termsVersionId);

  const countMap: Record<number, number> = {};
  for (const row of counts) {
    countMap[row.termsVersionId] = Number(row.count);
  }

  return versions.map((v) => ({
    ...v,
    acceptanceCount: countMap[v.id] ?? 0,
  }));
}
