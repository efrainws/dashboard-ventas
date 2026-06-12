import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) { console.log('DATABASE_URL no disponible'); process.exit(0); }

const conn = await createConnection(url);

// Verificar si la tabla existe
const [tables] = await conn.execute("SHOW TABLES LIKE 'own_brand_category_brands'");
console.log('Tabla own_brand_category_brands existe:', JSON.stringify(tables));

// Ver datos
const [rows] = await conn.execute('SELECT * FROM own_brand_category_brands LIMIT 20');
console.log('Datos en own_brand_category_brands:', JSON.stringify(rows, null, 2));

// Ver categorías
const [cats] = await conn.execute('SELECT * FROM own_brand_categories LIMIT 20');
console.log('Categorías:', JSON.stringify(cats, null, 2));

await conn.end();
