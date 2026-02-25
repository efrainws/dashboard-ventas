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