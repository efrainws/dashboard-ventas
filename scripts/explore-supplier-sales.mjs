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
  // Tomar un proveedor con muchos productos para probar las queries
  const testSupplier = await pool.query(`
    SELECT s.id, s.name, s.ruc, COUNT(p.id) as product_count
    FROM public.suppliers s
    JOIN public.products p ON p.supplier_id = s.id
    GROUP BY s.id, s.name, s.ruc
    ORDER BY product_count DESC
    LIMIT 1
  `);
  const sup = testSupplier.rows[0];
  console.log('\n=== Proveedor de prueba ===');
  console.log(sup);

  // 1. Ventas de los últimos 30 días para productos del proveedor
  console.log('\n=== Ventas últimos 30 días (via sales_detail + products) ===');
  const sales = await pool.query(`
    SELECT
      DATE(sh.doc_date) as fecha,
      COUNT(DISTINCT sh.id) as tickets,
      SUM(sd.total) as total_ventas,
      SUM(sd.quantity) as unidades
    FROM public.sales_detail sd
    JOIN public.sales_header sh ON sh.id = sd.header_id
    JOIN public.products p ON p.id = sd.product_id
    WHERE p.supplier_id = $1
      AND sh.doc_date >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(sh.doc_date)
    ORDER BY fecha DESC
    LIMIT 10
  `, [sup.id]);
  console.log('Columnas:', Object.keys(sales.rows[0] || {}));
  console.log(JSON.stringify(sales.rows, null, 2));

  // 2. Top productos más vendidos del proveedor
  console.log('\n=== Top 5 productos más vendidos del proveedor ===');
  const topProds = await pool.query(`
    SELECT
      p.name as producto,
      p.sku,
      SUM(sd.quantity) as unidades_vendidas,
      SUM(sd.total) as total_ventas
    FROM public.sales_detail sd
    JOIN public.products p ON p.id = sd.product_id
    JOIN public.sales_header sh ON sh.id = sd.header_id
    WHERE p.supplier_id = $1
      AND sh.doc_date >= NOW() - INTERVAL '30 days'
    GROUP BY p.id, p.name, p.sku
    ORDER BY total_ventas DESC
    LIMIT 5
  `, [sup.id]);
  console.log(JSON.stringify(topProds.rows, null, 2));

  // 3. Stocks actuales de productos del proveedor
  console.log('\n=== Stocks actuales por producto (top 5) ===');
  const stockCols = await pool.query(`SELECT * FROM public.stocks LIMIT 1`);
  console.log('Columnas stocks:', Object.keys(stockCols.rows[0] || {}));
  
  const stocks = await pool.query(`
    SELECT
      p.name as producto,
      p.sku,
      SUM(st.quantity) as stock_total
    FROM public.stocks st
    JOIN public.products p ON p.id = st.product_id
    WHERE p.supplier_id = $1
    GROUP BY p.id, p.name, p.sku
    ORDER BY stock_total DESC
    LIMIT 5
  `, [sup.id]);
  console.log(JSON.stringify(stocks.rows, null, 2));

  // 4. Órdenes de compra (receptions) del proveedor
  console.log('\n=== Recepciones del proveedor (últimas 5) ===');
  const recs = await pool.query(`
    SELECT
      r.oc,
      r.date,
      r.branch_sap_id,
      r.ordered_quantity,
      r.received_quantity,
      r.status,
      p.name as producto,
      p.sku
    FROM public.receptions r
    JOIN public.products p ON p.id = r.product_id
    WHERE p.supplier_id = $1
    ORDER BY r.date DESC
    LIMIT 5
  `, [sup.id]);
  console.log(JSON.stringify(recs.rows, null, 2));

  // 5. Ventas por tienda del proveedor (último mes)
  console.log('\n=== Ventas por tienda del proveedor (último mes) ===');
  const byBranch = await pool.query(`
    SELECT
      sh.branch_sap_id,
      b.name as tienda,
      SUM(sd.total) as total_ventas,
      COUNT(DISTINCT sh.id) as tickets
    FROM public.sales_detail sd
    JOIN public.sales_header sh ON sh.id = sd.header_id
    JOIN public.products p ON p.id = sd.product_id
    LEFT JOIN public.branches b ON b.sap_id = sh.branch_sap_id
    WHERE p.supplier_id = $1
      AND sh.doc_date >= NOW() - INTERVAL '30 days'
    GROUP BY sh.branch_sap_id, b.name
    ORDER BY total_ventas DESC
    LIMIT 5
  `, [sup.id]);
  console.log(JSON.stringify(byBranch.rows, null, 2));

  // 6. Resumen general del proveedor
  console.log('\n=== Resumen general (últimos 30 días) ===');
  const summary = await pool.query(`
    SELECT
      COUNT(DISTINCT p.id) as total_productos,
      COUNT(DISTINCT sh.id) as total_tickets,
      SUM(sd.total) as total_ventas,
      SUM(sd.quantity) as total_unidades
    FROM public.sales_detail sd
    JOIN public.products p ON p.id = sd.product_id
    JOIN public.sales_header sh ON sh.id = sd.header_id
    WHERE p.supplier_id = $1
      AND sh.doc_date >= NOW() - INTERVAL '30 days'
  `, [sup.id]);
  console.log(JSON.stringify(summary.rows, null, 2));

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
