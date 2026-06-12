import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT ?? 5432),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

try {
  // Verificar tablas que usa ownBrandRouter
  const tables = ['products', 'sales_detail', 'sales_header', 'branches', 'brands', 'stocks', 'receptions'];
  for (const t of tables) {
    const res = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS exists`, [t]);
    console.log(`Tabla ${t}: ${res.rows[0].exists ? 'EXISTE' : 'NO EXISTE'}`);
  }

  // Verificar columna brand_id en products
  const colRes = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'brand_id'
  `);
  console.log('\nbrand_id en products:', colRes.rows.length > 0 ? `EXISTE (${colRes.rows[0].data_type})` : 'NO EXISTE');

  // Verificar columnas de products
  const prodCols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products'
    ORDER BY ordinal_position
  `);
  console.log('\nColumnas de products:', prodCols.rows.map(r => `${r.column_name}(${r.data_type})`).join(', '));

  // Verificar si hay datos en brands
  const brandsRes = await pool.query(`SELECT COUNT(*) AS total FROM public.brands`);
  console.log('\nTotal brands en PostgreSQL:', brandsRes.rows[0].total);

  // Verificar las marcas configuradas en MySQL
  // brand_ids: f51ff5db-d8e0-47a3-8057-e85f0ae62fa4, bc20be58-3ad4-47c3-bebf-cae8607d99ce
  const brandCheck = await pool.query(`
    SELECT id, name FROM public.brands 
    WHERE id IN ('f51ff5db-d8e0-47a3-8057-e85f0ae62fa4', 'bc20be58-3ad4-47c3-bebf-cae8607d99ce')
  `);
  console.log('\nMarcas configuradas en PostgreSQL:', JSON.stringify(brandCheck.rows));

  // Verificar si hay productos con esas marcas
  const prodCheck = await pool.query(`
    SELECT COUNT(*) AS total FROM public.products 
    WHERE brand_id IN ('f51ff5db-d8e0-47a3-8057-e85f0ae62fa4', 'bc20be58-3ad4-47c3-bebf-cae8607d99ce')
  `);
  console.log('\nProductos con esas marcas:', prodCheck.rows[0].total);

} catch (e) {
  console.error('Error:', e.message);
} finally {
  await pool.end();
}
