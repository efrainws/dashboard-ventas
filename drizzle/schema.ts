import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).unique(),
  /** Username for local authentication */
  username: varchar("username", { length: 64 }).unique(),
  /** Hashed password for local authentication (bcrypt) */
  password: varchar("password", { length: 255 }),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Store monthly sales targets for tracking performance vs goals.
 * Each row represents a target for a specific store in a specific month.
 */
export const storeMonthlyTargets = mysqlTable("store_monthly_targets", {
  id: int("id").autoincrement().primaryKey(),
  /** Month in YYYY-MM format (e.g., "2026-02") */
  month: varchar("month", { length: 7 }).notNull(),
  /** Store ID from external PostgreSQL database */
  storeId: varchar("store_id", { length: 64 }).notNull(),
  /** Monthly sales target amount */
  monthlyTargetAmount: int("monthly_target_amount").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StoreMonthlyTarget = typeof storeMonthlyTargets.$inferSelect;
export type InsertStoreMonthlyTarget = typeof storeMonthlyTargets.$inferInsert;

/**
 * Discrepancy tickets: analysts report when dashboard numbers don't match their sources.
 * Used to notify the technical team and track resolution.
 */
export const discrepancyTickets = mysqlTable("discrepancy_tickets", {
  id: int("id").autoincrement().primaryKey(),
  /** Dashboard module where the discrepancy was found */
  module: varchar("module", { length: 64 }).notNull(),
  /** Date range start (YYYY-MM-DD) */
  dateFrom: varchar("date_from", { length: 10 }).notNull(),
  /** Date range end (YYYY-MM-DD) */
  dateTo: varchar("date_to", { length: 10 }).notNull(),
  /** Store ID or 'all' for all stores */
  storeId: varchar("store_id", { length: 64 }).notNull().default("all"),
  /** Store name for display */
  storeName: varchar("store_name", { length: 128 }).notNull().default("Todas las tiendas"),
  /** Amount shown in the dashboard */
  dashboardAmount: int("dashboard_amount"),
  /** Amount the analyst has in their source */
  analystAmount: int("analyst_amount"),
  /** Difference (analyst - dashboard) */
  difference: int("difference"),
  /** Description of the discrepancy */
  description: text("description").notNull(),
  /** Data source the analyst is comparing against */
  dataSource: varchar("data_source", { length: 128 }),
  /** Priority: low, medium, high */
  priority: mysqlEnum("priority", ["low", "medium", "high"]).default("medium").notNull(),
  /** Status: open, in_review, resolved, closed */
  status: mysqlEnum("status", ["open", "in_review", "resolved", "closed"]).default("open").notNull(),
  /** Resolution notes from the technical team */
  resolutionNotes: text("resolution_notes"),
  /** User ID who reported the ticket */
  reportedById: int("reported_by_id").notNull(),
  /** User name who reported the ticket (denormalized for display) */
  reportedByName: varchar("reported_by_name", { length: 128 }).notNull(),
  /** User ID who resolved the ticket */
  resolvedById: int("resolved_by_id"),
  /** User name who resolved the ticket */
  resolvedByName: varchar("resolved_by_name", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DiscrepancyTicket = typeof discrepancyTickets.$inferSelect;
export type InsertDiscrepancyTicket = typeof discrepancyTickets.$inferInsert;