/**
 * Seed inicial: asigna las marcas configuradas a sus categorías correspondientes.
 * 
 * Mapeo:
 * - FLORA & FAUNA (f51ff5db-d8e0-47a3-8057-e85f0ae62fa4) -> Marca Propia (id=1)
 * - FLORA & FAUNA EL HUERTO (bc20be58-3ad4-47c3-bebf-cae8607d99ce) -> El Huerto (id=2)
 */
import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) { console.log('DATABASE_URL no disponible'); process.exit(0); }

const conn = await createConnection(url);

// Ver estado actual
const [existing] = await conn.execute('SELECT * FROM own_brand_category_brands');
console.log('Estado actual de own_brand_category_brands:', JSON.stringify(existing));

// Ver categorías disponibles
const [cats] = await conn.execute('SELECT id, name FROM own_brand_categories WHERE is_active = 1');
console.log('Categorías activas:', JSON.stringify(cats));

// Mapeo a insertar
const mappings = [
  { brandId: 'f51ff5db-d8e0-47a3-8057-e85f0ae62fa4', categoryId: 1, brandName: 'FLORA & FAUNA', catName: 'Marca Propia' },
  { brandId: 'bc20be58-3ad4-47c3-bebf-cae8607d99ce', categoryId: 2, brandName: 'FLORA & FAUNA EL HUERTO', catName: 'El Huerto' },
];

for (const m of mappings) {
  // Verificar si ya existe
  const [rows] = await conn.execute('SELECT id FROM own_brand_category_brands WHERE brand_id = ?', [m.brandId]);
  if (rows.length > 0) {
    console.log(`Ya existe mapeo para ${m.brandName} -> ${m.catName}, actualizando...`);
    await conn.execute('UPDATE own_brand_category_brands SET category_id = ? WHERE brand_id = ?', [m.categoryId, m.brandId]);
  } else {
    console.log(`Insertando: ${m.brandName} -> ${m.catName}`);
    await conn.execute('INSERT INTO own_brand_category_brands (brand_id, category_id) VALUES (?, ?)', [m.brandId, m.categoryId]);
  }
}

// Verificar resultado
const [result] = await conn.execute('SELECT * FROM own_brand_category_brands');
console.log('Estado final:', JSON.stringify(result, null, 2));

await conn.end();
console.log('Seed completado exitosamente.');
