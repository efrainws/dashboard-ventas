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
  const supplierId = '63fdd77d-ad5a-40b0-9471-556bb2d9d941'; // TIAN CORP

  // Ver columnas exactas de sales_header
  console.log('\n=== sales_header columnas ===');
  const shCols = await pool.query(`SELECT * FROM public.sales_header LIMIT 1`);
  console.log('Columnas:', Object.keys(shCols.rows[0] || {}));

  // Ver columnas exactas de branches
  console.log('\n=== branches columnas ===');
  const brCols = await pool.query(`SELECT * FROM public.branches LIMIT 2`);
  console.log('Columnas:', Object.keys(brCols.rows[0] || {}));
  console.log(JSON.stringify(brCols.rows, null, 2));

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
