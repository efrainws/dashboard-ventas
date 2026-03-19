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

// Ver columnas de products
const cols = await pool.query(`
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'products'
  ORDER BY ordinal_position
`);
console.log('=== products columns ===');
cols.rows.forEach(r => console.log(r.column_name, '-', r.data_type));

// Ver muestra de datos
const sample = await pool.query('SELECT * FROM public.products LIMIT 3');
console.log('\n=== sample rows ===');
console.log(JSON.stringify(sample.rows, null, 2));

// Ver si hay columna supplier_id o similar
const supplierCol = cols.rows.find(r => r.column_name.includes('supplier'));
console.log('\n=== supplier-related columns ===', supplierCol || 'NONE FOUND');

// Ver tabla suppliers
const suppCols = await pool.query(`
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'suppliers'
  ORDER BY ordinal_position
`);
console.log('\n=== suppliers columns ===');
suppCols.rows.forEach(r => console.log(r.column_name, '-', r.data_type));

// Muestra de suppliers
const suppSample = await pool.query('SELECT * FROM public.suppliers LIMIT 3');
console.log('\n=== suppliers sample ===');
console.log(JSON.stringify(suppSample.rows, null, 2));

// Ver si existe tabla intermedia products_suppliers o similar
const intermTables = await pool.query(`
  SELECT table_name FROM information_schema.tables 
  WHERE table_schema = 'public' AND (table_name ILIKE '%supplier%' OR table_name ILIKE '%product%')
  ORDER BY table_name
`);
console.log('\n=== tables with supplier or product ===');
intermTables.rows.forEach(r => console.log(r.table_name));

// Ver foreign keys de products
const fks = await pool.query(`
  SELECT
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'products'
`);
console.log('\n=== products foreign keys ===');
fks.rows.forEach(r => console.log(r.column_name, '->', r.foreign_table_name + '.' + r.foreign_column_name));

await pool.end();
