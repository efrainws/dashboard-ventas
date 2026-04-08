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
  // Estructura de stocks
  const stocksCols = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stocks'
    ORDER BY ordinal_position
  `);
  console.log('Columnas de stocks:', JSON.stringify(stocksCols.rows, null, 2));

  // Estructura de warehouses
  const warehousesCols = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'warehouses'
    ORDER BY ordinal_position
  `);
  console.log('\nColumnas de warehouses:', JSON.stringify(warehousesCols.rows, null, 2));

  // Muestra de datos de stocks
  const sample = await pool.query(`SELECT * FROM public.stocks LIMIT 3`);
  console.log('\nMuestra de stocks:', JSON.stringify(sample.rows, null, 2));

  // Muestra de warehouses
  const wSample = await pool.query(`SELECT * FROM public.warehouses LIMIT 5`);
  console.log('\nMuestra de warehouses:', JSON.stringify(wSample.rows, null, 2));

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
