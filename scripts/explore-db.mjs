import pkg from 'pg';
import { config } from 'dotenv';
config();

const { Pool } = pkg;
const pool = new Pool({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT ?? 5432),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  // 1. Listar todas las tablas públicas
  const tables = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  console.log('\n=== TABLAS DISPONIBLES ===');
  tables.rows.forEach(r => console.log(' -', r.table_name));

  // 2. Explorar tabla suppliers
  console.log('\n=== SUPPLIERS (primeras 5 filas) ===');
  const suppliers = await pool.query(`SELECT * FROM public.suppliers LIMIT 5`);
  console.log('Columnas:', Object.keys(suppliers.rows[0] || {}));
  console.log(JSON.stringify(suppliers.rows, null, 2));

  // 3. Buscar tablas relacionadas con proveedores
  const supplierTables = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND (table_name ILIKE '%supplier%' OR table_name ILIKE '%proveedor%' OR table_name ILIKE '%vendor%' OR table_name ILIKE '%purchase%' OR table_name ILIKE '%compra%' OR table_name ILIKE '%order%' OR table_name ILIKE '%product%')
    ORDER BY table_name
  `);
  console.log('\n=== TABLAS RELACIONADAS CON PROVEEDORES ===');
  supplierTables.rows.forEach(r => console.log(' -', r.table_name));

  // 4. Explorar columnas de todas las tablas para encontrar supplier_id o similar
  const supplierCols = await pool.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND (column_name ILIKE '%supplier%' OR column_name ILIKE '%vendor%' OR column_name ILIKE '%proveedor%')
    ORDER BY table_name, column_name
  `);
  console.log('\n=== COLUMNAS CON REFERENCIA A SUPPLIER ===');
  supplierCols.rows.forEach(r => console.log(` - ${r.table_name}.${r.column_name} (${r.data_type})`));

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
