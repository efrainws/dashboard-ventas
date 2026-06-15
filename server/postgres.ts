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
  min: 2,                           // Conexiones mínimas precalentadas
  idleTimeoutMillis: 60_000,        // Liberar conexiones inactivas tras 60s
  connectionTimeoutMillis: 15_000,  // Timeout para adquirir conexión del pool
});

// Aplicar statement_timeout al conectar para evitar queries colgadas
pool.on('connect', (client) => {
  // 120 segundos — las queries de comparación de períodos en /sales son complejas
  // y pueden tardar más de 30s con grandes volúmenes de datos
  client.query('SET statement_timeout = 120000').catch(() => {});
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle client', err);
});

export { pool };
