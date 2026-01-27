import { Pool } from 'pg';

// Configuración de conexión a PostgreSQL de producción (solo lectura)
const productionPool = new Pool({
  host: 'database-flora-y-fauna.clei6ceoew9j.us-east-2.rds.amazonaws.com',
  port: 5432,
  database: 'production-middleware-florayfauna',
  user: 'postgres',
  password: '1tU1TTGYUmkTe5DGZXjg',
  ssl: {
    rejectUnauthorized: false, // AWS RDS requiere SSL
  },
  max: 10, // Máximo de conexiones en el pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Verificar conexión al inicializar
productionPool.on('connect', () => {
  console.log('[PostgreSQL] Connected to production database');
});

productionPool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle client', err);
});

export { productionPool };
