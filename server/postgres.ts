import pkg from 'pg';
const { Pool } = pkg;

// Configuración de conexión a PostgreSQL
const pool = new Pool({
  host: 'database-flora-y-fauna.clei6ceoew9j.us-east-2.rds.amazonaws.com',
  port: 5432,
  user: 'user01',
  password: 'ogkDsfN7dwQI4yYb3zzR',
  database: 'production-middleware-florayfauna',
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
