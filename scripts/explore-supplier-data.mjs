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
  // 1. Columnas de products_supplier
  console.log('\n=== products_supplier (columnas y muestra) ===');
  const ps = await pool.query(`SELECT * FROM public.products_supplier LIMIT 3`);
  console.log('Columnas:', Object.keys(ps.rows[0] || {}));
  console.log(JSON.stringify(ps.rows, null, 2));

  // 2. Columnas de products
  console.log('\n=== products (columnas) ===');
  const prods = await pool.query(`SELECT * FROM public.products LIMIT 2`);
  console.log('Columnas:', Object.keys(prods.rows[0] || {}));

  // 3. Columnas de stocks
  console.log('\n=== stocks (columnas y muestra) ===');
  const stocks = await pool.query(`SELECT * FROM public.stocks LIMIT 3`);
  console.log('Columnas:', Object.keys(stocks.rows[0] || {}));
  console.log(JSON.stringify(stocks.rows, null, 2));

  // 4. Columnas de orders y order_details
  console.log('\n=== orders (columnas y muestra) ===');
  const orders = await pool.query(`SELECT * FROM public.orders LIMIT 3`);
  console.log('Columnas:', Object.keys(orders.rows[0] || {}));
  console.log(JSON.stringify(orders.rows, null, 2));

  console.log('\n=== order_details (columnas y muestra) ===');
  const od = await pool.query(`SELECT * FROM public.order_details LIMIT 3`);
  console.log('Columnas:', Object.keys(od.rows[0] || {}));
  console.log(JSON.stringify(od.rows, null, 2));

  // 5. Columnas de receptions
  console.log('\n=== receptions (columnas y muestra) ===');
  const rec = await pool.query(`SELECT * FROM public.receptions LIMIT 3`);
  console.log('Columnas:', Object.keys(rec.rows[0] || {}));
  console.log(JSON.stringify(rec.rows, null, 2));

  // 6. Contar productos por proveedor
  console.log('\n=== Productos por proveedor (top 10) ===');
  const prodBySupplier = await pool.query(`
    SELECT s.name, s.ruc, COUNT(p.id) as product_count
    FROM public.suppliers s
    LEFT JOIN public.products p ON p.supplier_id = s.id
    GROUP BY s.id, s.name, s.ruc
    ORDER BY product_count DESC
    LIMIT 10
  `);
  console.log(JSON.stringify(prodBySupplier.rows, null, 2));

  // 7. Contar registros en products_supplier
  console.log('\n=== Conteo en products_supplier ===');
  const psCount = await pool.query(`SELECT COUNT(*) FROM public.products_supplier`);
  console.log('Total:', psCount.rows[0].count);

  // 8. Columnas de sales_detail para ver si hay referencia a proveedor
  console.log('\n=== sales_detail (columnas) ===');
  const sd = await pool.query(`SELECT * FROM public.sales_detail LIMIT 1`);
  console.log('Columnas:', Object.keys(sd.rows[0] || {}));

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
