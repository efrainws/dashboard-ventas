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

  // 3. Stocks actuales (columna correcta: stock)
  console.log('\n=== Stocks actuales por producto (top 5) ===');
  const stocks = await pool.query(`
    SELECT
      p.name as producto,
      p.sku,
      SUM(st.stock) as stock_total
    FROM public.stocks st
    JOIN public.products p ON p.id = st.product_id
    WHERE p.supplier_id = $1
    GROUP BY p.id, p.name, p.sku
    ORDER BY stock_total DESC
    LIMIT 5
  `, [supplierId]);
  console.log(JSON.stringify(stocks.rows, null, 2));

  // 4. Recepciones del proveedor
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
  `, [supplierId]);
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
    LIMIT 10
  `, [supplierId]);
  console.log(JSON.stringify(byBranch.rows, null, 2));

  // 6. Resumen general del proveedor (últimos 30 días)
  console.log('\n=== Resumen general (últimos 30 días) ===');
  const summary = await pool.query(`
    SELECT
      COUNT(DISTINCT p.id) as total_productos,
      COUNT(DISTINCT sh.id) as total_tickets,
      ROUND(SUM(sd.total)::numeric, 2) as total_ventas,
      ROUND(SUM(sd.quantity)::numeric, 2) as total_unidades
    FROM public.sales_detail sd
    JOIN public.products p ON p.id = sd.product_id
    JOIN public.sales_header sh ON sh.id = sd.header_id
    WHERE p.supplier_id = $1
      AND sh.doc_date >= NOW() - INTERVAL '30 days'
  `, [supplierId]);
  console.log(JSON.stringify(summary.rows, null, 2));

  // 7. Ventas por mes (últimos 6 meses)
  console.log('\n=== Ventas por mes (últimos 6 meses) ===');
  const byMonth = await pool.query(`
    SELECT
      TO_CHAR(sh.doc_date, 'YYYY-MM') as mes,
      ROUND(SUM(sd.total)::numeric, 2) as total_ventas,
      COUNT(DISTINCT sh.id) as tickets,
      ROUND(SUM(sd.quantity)::numeric, 2) as unidades
    FROM public.sales_detail sd
    JOIN public.products p ON p.id = sd.product_id
    JOIN public.sales_header sh ON sh.id = sd.header_id
    WHERE p.supplier_id = $1
      AND sh.doc_date >= NOW() - INTERVAL '6 months'
    GROUP BY TO_CHAR(sh.doc_date, 'YYYY-MM')
    ORDER BY mes DESC
  `, [supplierId]);
  console.log(JSON.stringify(byMonth.rows, null, 2));

  // 8. Conteo de recepciones por estado
  console.log('\n=== Recepciones por estado ===');
  const recStatus = await pool.query(`
    SELECT
      r.status,
      COUNT(*) as cantidad,
      SUM(r.ordered_quantity) as total_ordenado,
      SUM(r.received_quantity) as total_recibido
    FROM public.receptions r
    JOIN public.products p ON p.id = r.product_id
    WHERE p.supplier_id = $1
    GROUP BY r.status
  `, [supplierId]);
  console.log(JSON.stringify(recStatus.rows, null, 2));

  // 9. Productos con stock bajo (stock < 5)
  console.log('\n=== Productos con stock bajo (< 5 unidades por tienda) ===');
  const lowStock = await pool.query(`
    SELECT
      p.name as producto,
      p.sku,
      b.name as tienda,
      st.stock
    FROM public.stocks st
    JOIN public.products p ON p.id = st.product_id
    JOIN public.branches b ON b.id = st.branch_id
    WHERE p.supplier_id = $1
      AND st.stock > 0
      AND st.stock < 5
    ORDER BY st.stock ASC
    LIMIT 10
  `, [supplierId]);
  console.log(JSON.stringify(lowStock.rows, null, 2));

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
