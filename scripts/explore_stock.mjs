import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  // 1. Buscar tablas relacionadas con stock/inventario
  const tables = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND (table_name ILIKE '%stock%' OR table_name ILIKE '%invent%' OR table_name ILIKE '%warehouse%' OR table_name ILIKE '%almacen%')
    ORDER BY table_name
  `);
  console.log('Tablas de stock/inventario:', JSON.stringify(tables.rows, null, 2));

  // 2. Listar todas las tablas públicas
  const allTables = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  console.log('\nTodas las tablas públicas:', allTables.rows.map(r => r.table_name).join(', '));

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
