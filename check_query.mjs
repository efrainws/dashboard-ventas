import { createConnection, createPool } from 'mysql2/promise';
import pg from 'pg';

const mysqlUrl = process.env.DATABASE_URL;
const pgUrl = process.env.POSTGRES_URL || process.env.PG_URL;

console.log('MySQL URL available:', !!mysqlUrl);

if (!mysqlUrl) { console.log('DATABASE_URL no disponible'); process.exit(0); }

// Test 1: Verificar que la tabla existe y está vacía
const conn = await createConnection(mysqlUrl);
const [tables] = await conn.execute("SHOW TABLES LIKE 'own_brand_category_brands'");
console.log('Tabla existe:', tables.length > 0);

const [rows] = await conn.execute('SELECT * FROM own_brand_category_brands LIMIT 20');
console.log('Filas en own_brand_category_brands:', rows.length);

const [brands] = await conn.execute('SELECT * FROM own_brand_brands LIMIT 20');
console.log('Marcas en own_brand_brands:', JSON.stringify(brands, null, 2));

await conn.end();

// Test 2: Simular múltiples queries MySQL en paralelo (como haría tRPC batch)
console.log('\n--- Test de concurrencia ---');
const pool = createPool({ uri: mysqlUrl });

try {
  const promises = Array.from({ length: 5 }, (_, i) => 
    pool.execute('SELECT brand_id FROM own_brand_category_brands WHERE category_id = ?', [i + 1])
  );
  const results = await Promise.all(promises);
  console.log('Queries paralelas OK:', results.map(([r]) => r.length));
} catch (e) {
  console.error('Error en queries paralelas:', e.message);
}

await pool.end();
console.log('Done');
