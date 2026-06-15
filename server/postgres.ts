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
 * Warm-up del caché de PostgreSQL (RDS).
 *
 * El problema: sales_header (291 MB) + sales_detail (1186 MB) no están en el buffer cache
 * de PostgreSQL cuando el servidor lleva tiempo inactivo. La primera query que toca estas
 * tablas debe leer ~11,000 páginas desde disco EBS, lo que tarda 14-42 segundos.
 *
 * Solución: ejecutar queries ligeras periódicamente para mantener las páginas más recientes
 * en el buffer cache de RDS. Esto reduce el cold start de 14-42s a <1s.
 *
 * Estrategia:
 * - Al iniciar: warm-up completo de los últimos 7 días (carga datos recientes en caché)
 * - Cada 4 minutos: keep-alive de los últimos 2 días (mantiene datos calientes)
 */
async function warmupCache(label: string): Promise<void> {
  const client = await pool.connect();
  try {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(today.getDate() - 2);

    const dateStr = (d: Date) => d.toISOString().substring(0, 10);

    if (label === 'startup') {
      // Warm-up completo: cargar los últimos 7 días en caché
      // Esto toca sales_header + sales_detail + branches para el rango más consultado
      await client.query(`
        SELECT
          sh.id,
          sh.doc_date,
          sh.branch_id,
          sh.total,
          sh.subtotal,
          sd.product_id,
          sd.total AS line_total
        FROM sales_header sh
        JOIN sales_detail sd ON sd.header_id = sh.id
        WHERE sh.doc_date >= $1::date
          AND sh.doc_date < ($2::date + INTERVAL '1 day')
        LIMIT 100000
      `, [dateStr(sevenDaysAgo), dateStr(today)]);

      console.log('[PostgreSQL] Cache warm-up completado — últimos 7 días cargados en memoria');
    } else {
      // Keep-alive: mantener los últimos 2 días calientes
      await client.query(`
        SELECT COUNT(*) FROM sales_header sh
        WHERE sh.doc_date >= $1::date
          AND sh.doc_date < ($2::date + INTERVAL '1 day')
      `, [dateStr(twoDaysAgo), dateStr(today)]);
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

  // Keep-alive cada 4 minutos — mantiene datos recientes en el buffer cache de RDS
  // RDS expulsa páginas del caché si no hay actividad por ~5 minutos
  setInterval(() => {
    warmupCache('keepalive').catch(() => {});
  }, 4 * 60 * 1_000);
}

export { pool };
