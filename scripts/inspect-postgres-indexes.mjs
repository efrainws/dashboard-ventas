import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT ?? 5432),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  ssl: { rejectUnauthorized: false },
});

const result = await pool.query(`
  SELECT
    tablename,
    indexname,
    indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = ANY($1::text[])
  ORDER BY tablename, indexname
`, [[
  'sales_header',
  'sales_detail',
  'stocks',
  'products',
  'branches',
  'categories_products',
]]);

console.table(result.rows);
await pool.end();
