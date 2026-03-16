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
    rejectUnauthorized: false, // Necesario para RDS sin certificado personalizado
  },
  // Configuración para manejar grandes volúmenes de datos
  max: 20, // Máximo de conexiones en el pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Verificar conexión al iniciar
pool.on('connect', () => {
  console.log('[PostgreSQL] Connected to production database');
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle client', err);
});

export { pool };
