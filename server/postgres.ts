import pkg from 'pg';
const { Pool } = pkg;

// Configuración de conexión a PostgreSQL — credenciales leídas desde variables de entorno
const pool = new Pool({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT ?? 5432),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  // Configuración SSL requerida por RDS
  ssl: {
    rejectUnauthorized: false,
  },
  // Pool ampliado para soportar múltiples queries paralelas de los portales
  max: 30,                          // Máximo de conexiones simultáneas
  min: 3,                           // Conexiones mínimas precalentadas (evita cold start)
  idleTimeoutMillis: 300_000,       // 5 min — mantener conexiones más tiempo para evitar cold start
  connectionTimeoutMillis: 15_000,  // Timeout para adquirir conexión del pool
});

// Aplicar statement_timeout al conectar para evitar queries colgadas
pool.on('connect', (client) => {
  // 120 segundos — las queries de comparación de períodos en /sales son complejas
  client.query('SET statement_timeout = 120000').catch(() => {});
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle client', err);
});

/**
 * Ejecuta una query con reintentos automáticos ante desconexiones transitorias de RDS.
 *
 * RDS puede cerrar conexiones idle sin previo aviso (TCP keepalive timeout, failover, etc.).
 * Cuando eso ocurre, `pool.query()` lanza "Connection terminated unexpectedly" o
 * "Client was closed and is not queryable". Esta función captura esos errores y reintenta
 * hasta `maxRetries` veces con backoff exponencial antes de propagar el error.
 *
 * @param sql   Texto de la query SQL
 * @param params Parámetros posicionales
 * @param maxRetries Número máximo de reintentos (default: 3)
 */
export async function queryWithRetry(
  sql: string,
  params: unknown[] = [],
  maxRetries = 3
): Promise<import('pg').QueryResult> {
  const RETRYABLE = [
    'connection terminated',
    'client was closed',
    'connection ended',
    'econnreset',
    'econnrefused',
    'etimedout',
    'socket hang up',
    'unexpected error on idle client',
  ];

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await pool.query(sql, params);
    } catch (err: unknown) {
      lastErr = err;
      const msg = ((err as Error)?.message ?? '').toLowerCase();
      const isRetryable = RETRYABLE.some(s => msg.includes(s));
      if (!isRetryable || attempt === maxRetries) throw err;
      const delay = 200 * Math.pow(2, attempt); // 200ms, 400ms, 800ms
      console.warn(`[PostgreSQL] Query failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms — ${msg}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Warm-up del caché de PostgreSQL (RDS).
 *
 * El problema: sales_header (291 MB) + sales_detail (1186 MB) + products no están en el
 * buffer cache de PostgreSQL cuando el servidor lleva tiempo inactivo. La primera query que
 * toca estas tablas debe leer páginas desde disco EBS, lo que tarda 14-60 segundos.
 *
 * Solución: ejecutar queries específicas periódicamente para mantener las páginas más
 * recientes en el buffer cache de RDS.
 *
 * Estrategia:
 * - Al iniciar: warm-up completo — products + 6 meses de sales_header + 14 días de sales_detail
 * - Cada 3 minutos: keep-alive de los últimos 3 días con JOIN products (mantiene datos calientes)
 */
async function warmupCache(label: string): Promise<void> {
  const client = await pool.connect();
  try {
    const today = new Date();
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 14);
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 3);
    const sixMonthsAgo = new Date(today);
    sixMonthsAgo.setMonth(today.getMonth() - 6);

    const dateStr = (d: Date) => d.toISOString().substring(0, 10);

    if (label === 'startup') {
      // Paso 1: Cargar products + brands en caché (tabla pequeña, carga rápida)
      // Crítico para portal de marca propia: filtra por brand_id
      await client.query(`
        SELECT COUNT(*)
        FROM products p
        LEFT JOIN brands b ON b.id = p.brand_id
      `);

      // Paso 2: Recorrer sales_header sin transferir filas al proceso Node.
      // COUNT mantiene el efecto de precalentamiento en PostgreSQL y evita
      // materializar cientos de miles de objetos JavaScript en cada arranque.
      await client.query(`
        SELECT COUNT(*)
        FROM sales_header
        WHERE doc_date >= $1::date
      `, [dateStr(sixMonthsAgo)]);

      // Paso 3: Recorrer sales_detail reciente con JOIN a products.
      // Toca idx_sales_detail_header_id + idx_sales_detail_product_id + index_products_on_brand_id
      await client.query(`
        SELECT COUNT(*)
        FROM (
          SELECT 1
          FROM sales_header sh
          JOIN sales_detail sd ON sd.header_id = sh.id
          JOIN products p ON p.id = sd.product_id
          WHERE sh.doc_date >= $1::date
            AND sh.doc_date < ($2::date + INTERVAL '1 day')
          LIMIT 200000
        ) AS warmup_rows
      `, [dateStr(fourteenDaysAgo), dateStr(today)]);

      // Paso 4: Cargar branches y categories
      await client.query(`SELECT id, name, sap_id FROM branches`);
      await client.query(`SELECT id, name, parent_category_id FROM categories LIMIT 5000`);

      console.log('[PostgreSQL] Cache warm-up completado — páginas consultadas sin transferir filas masivas al proceso');
    } else {
      // Keep-alive: mantener los últimos 3 días calientes con JOIN que toca sales_detail + products
      await client.query(`
        SELECT COUNT(*)
        FROM (
          SELECT 1
          FROM sales_header sh
          JOIN sales_detail sd ON sd.header_id = sh.id
          JOIN products p ON p.id = sd.product_id
          WHERE sh.doc_date >= $1::date
            AND sh.doc_date < ($2::date + INTERVAL '1 day')
          LIMIT 50000
        ) AS warmup_rows
      `, [dateStr(threeDaysAgo), dateStr(today)]);
    }
  } catch (err) {
    // No lanzar error — el warm-up es best-effort
    console.warn(`[PostgreSQL] Cache warm-up (${label}) falló:`, (err as Error).message);
  } finally {
    client.release();
  }
}

/**
 * Inicializar el pool: warm-up al arrancar y job periódico de keep-alive.
 * Se llama desde server/_core/index.ts al iniciar el servidor.
 */
export async function initPool(): Promise<void> {
  // Warm-up inicial con delay para no bloquear el arranque del servidor
  setTimeout(() => {
    warmupCache('startup').catch(() => {});
  }, 2_000);

  // Keep-alive cada 3 minutos — mantiene datos recientes en el buffer cache de RDS
  // El keep-alive ahora incluye JOIN con products para mantener el índice brand_id caliente
  setInterval(() => {
    warmupCache('keepalive').catch(() => {});
  }, 3 * 60 * 1_000);
}

export { pool };
