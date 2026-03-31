import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Roles de usuario:
 * - system_specialist: Especialista de Sistemas. Sin restricciones. Puede crear cualquier tipo de usuario.
 * - cst_user: Usuario CST. Sin restricciones de datos. Solo puede crear usuarios tipo store_user.
 * - commercial_specialist: Especialista Comercial. Igual que cst_user pero solo puede crear supplier_user.
 * - store_user: Usuario Tienda. Solo ve datos de su tienda asignada (assigned_store_code). No puede crear usuarios.
 * - supplier_user: Usuario Proveedor. Solo accede al módulo de proveedores. Requiere assigned_supplier_id.
 * - own_brand_user: Usuario Marca Propia. Accede al Portal Marca Propia. Mismos accesos que commercial_specialist.
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
  role: mysqlEnum("role", ["system_specialist", "cst_user", "commercial_specialist", "store_user", "supplier_user", "own_brand_user"]).default("cst_user").notNull(),
  /**
   * SAP ID de la tienda asignada al usuario.
   * Obligatorio para store_user. Vacío para los demás roles.
   */
  assignedStoreCode: varchar("assigned_store_code", { length: 32 }),
  /**
   * ID del proveedor asignado (de la tabla public.suppliers en PostgreSQL).
   * Obligatorio para supplier_user. Vacío para los demás roles.
   */
  assignedSupplierId: varchar("assigned_supplier_id", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),

  // ── Trial / Subscription fields (supplier_user only) ──────────────────────
  /**
   * Estado del acceso del proveedor:
   * - trial_active: dentro del período de prueba (activation_date .. trial_end_date)
   * - trial_expired: trial vencido sin aceptar términos
   * - subscribed_active: aceptó términos y fue activado para facturación
   * - access_requested: vencido, aceptó términos, pendiente de aprobación
   * - suspended: deshabilitado manualmente
   */
  supplierStatus: mysqlEnum("supplier_status", [
    "pending_activation",
    "trial_active",
    "trial_expired",
    "subscribed_active",
    "access_requested",
    "suspended",
  ]),
  /** Fecha en que se activó el acceso (inicio del trial) */
  activationDate: timestamp("activation_date"),
  /** Fecha de vencimiento del trial (activationDate + 7 días) */
  trialEndDate: timestamp("trial_end_date"),
  /** Fecha en que inició la suscripción facturada */
  subscriptionStartDate: timestamp("subscription_start_date"),
  /** ID de la versión de términos aceptada */
  termsVersionId: int("terms_version_id"),
  /** Timestamp de aceptación de términos */
  termsAcceptedAt: timestamp("terms_accepted_at"),
  /** IP desde la que se aceptaron los términos */
  termsAcceptedIp: varchar("terms_accepted_ip", { length: 64 }),
  /** ID del usuario que aprobó la solicitud de acceso */
  approvedById: int("approved_by_id"),
  /** Timestamp de aprobación */
  approvedAt: timestamp("approved_at"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type SupplierStatus = "pending_activation" | "trial_active" | "trial_expired" | "subscribed_active" | "access_requested" | "suspended";

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

/**
 * Account activation tokens for new users.
 * When a user is created, a token is generated and sent via email.
 * The user must visit /activate/:token, verify their temporary credentials,
 * and set a new password before they can log in.
 */
export const activationTokens = mysqlTable("activation_tokens", {
  id: int("id").autoincrement().primaryKey(),
  /** Unique token (UUID v4 or random hex) sent in the activation link */
  token: varchar("token", { length: 128 }).notNull().unique(),
  /** The user this token belongs to */
  userId: int("user_id").notNull(),
  /** Username for verification on the activation page */
  username: varchar("username", { length: 64 }).notNull(),
  /** Token expiration timestamp (48 hours from creation) */
  expiresAt: timestamp("expires_at").notNull(),
  /** Whether the token has been used */
  used: int("used").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ActivationToken = typeof activationTokens.$inferSelect;
export type InsertActivationToken = typeof activationTokens.$inferInsert;

/**
 * Versiones de los términos y condiciones del servicio.
 * Solo una versión puede estar activa a la vez (is_active = true).
 */
export const termsVersions = mysqlTable("terms_versions", {
  id: int("id").autoincrement().primaryKey(),
  /** Número de versión legible (e.g., "1.0", "1.1") */
  version: varchar("version", { length: 16 }).notNull(),
  /** Contenido completo de los términos (HTML o Markdown) */
  content: text("content").notNull(),
  /** Si esta versión está actualmente vigente */
  isActive: int("is_active").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TermsVersion = typeof termsVersions.$inferSelect;
export type InsertTermsVersion = typeof termsVersions.$inferInsert;

/**
 * Registro de aceptaciones de términos por usuario.
 * Cada vez que un usuario acepta una versión de términos se crea un registro.
 */
export const termsAcceptance = mysqlTable("terms_acceptance", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  termsVersionId: int("terms_version_id").notNull(),
  /** Timestamp de aceptación */
  acceptedAt: timestamp("accepted_at").defaultNow().notNull(),
  /** IP desde la que se aceptó */
  ip: varchar("ip", { length: 64 }),
});

export type TermsAcceptance = typeof termsAcceptance.$inferSelect;
export type InsertTermsAcceptance = typeof termsAcceptance.$inferInsert;

/**
 * Marcas configuradas globalmente como "Marca Propia".
 * Cualquier usuario own_brand_user ve todos los artículos cuyas marcas estén en esta tabla.
 * La configuración es global para toda la empresa; no hay asignación por usuario.
 * Seeds iniciales: f51ff5db-d8e0-47a3-8057-e85f0ae62fa4 y bc20be58-3ad4-47c3-bebf-cae8607d99ce.
 */
export const ownBrandBrands = mysqlTable("own_brand_brands", {
  id: int("id").autoincrement().primaryKey(),
  /** UUID de la marca en la tabla public.brands de PostgreSQL */
  brandId: varchar("brand_id", { length: 64 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OwnBrandBrand = typeof ownBrandBrands.$inferSelect;
export type InsertOwnBrandBrand = typeof ownBrandBrands.$inferInsert;
