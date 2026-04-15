/**
 * Seed script: inserta la conexión PostgreSQL por defecto en la tabla db_connections.
 * Solo se ejecuta si no existe ya una conexión con el mismo host+database.
 *
 * Uso: node scripts/seed-default-pg-connection.mjs
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { createCipheriv, createHash, randomBytes } from "crypto";

// ── Encryption (debe coincidir con dbConnectionsRouter.ts) ───────────────────
function getEncryptionKey() {
  const secret = process.env.JWT_SECRET ?? "fallback-secret-change-in-prod";
  return createHash("sha256").update(secret).digest();
}

function encryptPassword(plaintext) {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const c = createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

// ── Connection data ───────────────────────────────────────────────────────────
const PG_HOST     = process.env.PG_HOST     ?? "";
const PG_PORT     = Number(process.env.PG_PORT ?? 5432);
const PG_USER     = process.env.PG_USER     ?? "";
const PG_PASSWORD = process.env.PG_PASSWORD ?? "";
const PG_DATABASE = process.env.PG_DATABASE ?? "";
const DB_URL      = process.env.DATABASE_URL ?? "";

if (!PG_HOST || !PG_USER || !PG_PASSWORD || !PG_DATABASE) {
  console.error("❌ Variables PG_HOST, PG_USER, PG_PASSWORD y PG_DATABASE son requeridas.");
  process.exit(1);
}

// ── MySQL connection (app DB) ─────────────────────────────────────────────────
const conn = await mysql.createConnection(DB_URL);

try {
  // Check if already exists
  const [rows] = await conn.execute(
    "SELECT id FROM db_connections WHERE host = ? AND `database` = ? LIMIT 1",
    [PG_HOST, PG_DATABASE]
  );

  if (rows.length > 0) {
    console.log(`ℹ️  La conexión para ${PG_HOST}/${PG_DATABASE} ya existe (id=${rows[0].id}). No se insertará duplicado.`);
    process.exit(0);
  }

  // Encrypt password
  const passwordEncrypted = encryptPassword(PG_PASSWORD);

  // Insert
  const [result] = await conn.execute(
    `INSERT INTO db_connections
      (name, description, host, port, \`database\`, username, password_encrypted,
       ssl_enabled, ssl_mode, purpose, is_active, last_test_status,
       created_by_id, created_by_name, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      "Producción — Flora & Fauna",
      "Base de datos principal de ventas y stock de Flora & Fauna (RDS AWS us-east-2)",
      PG_HOST,
      PG_PORT,
      PG_DATABASE,
      PG_USER,
      passwordEncrypted,
      1,          // ssl_enabled
      "require",  // ssl_mode
      "both",     // purpose: ventas y stock
      1,          // is_active
      "pending",  // last_test_status
      1,          // created_by_id (system)
      "Sistema",  // created_by_name
    ]
  );

  console.log(`✅ Conexión insertada con id=${result.insertId}`);
  console.log(`   Nombre: Producción — Flora & Fauna`);
  console.log(`   Host:   ${PG_HOST}:${PG_PORT}`);
  console.log(`   BD:     ${PG_DATABASE}`);
  console.log(`   User:   ${PG_USER}`);
} finally {
  await conn.end();
}
