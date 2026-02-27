import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { DiscrepancyTicket, discrepancyTickets, InsertDiscrepancyTicket, InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

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
      values.role = 'admin';
      updateSet.role = 'admin';
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
 * Returns the list of admin users that have an email address configured.
 * Used to send ticket notification emails to all admins.
 */
export async function getAdminEmails(): Promise<Array<{ name: string | null; email: string }>> {
  const db = await getDb();
  if (!db) return [];

  const admins = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.role, "admin"));

  return admins.filter((a): a is { name: string | null; email: string } => !!a.email);
}
