"""
Optimizar las queries del portal de marca propia:
1. Reemplazar buildBrandProductsSubquery (p.id IN subquery) por p.brand_id = ANY($N::uuid[])
2. Agregar caché a todas las queries de ventas (getSalesSummary, getDailySales, etc.)

El cambio clave:
  ANTES:  WHERE p.id IN (SELECT id FROM products WHERE brand_id IN ($1, $2, ...))
  DESPUÉS: WHERE p.brand_id = ANY($1::uuid[])

Esto permite al planner usar index_products_on_brand_id directamente en el JOIN.
"""
import re

filepath = 'server/ownBrandRouter.ts'
with open(filepath, 'r') as f:
    content = f.read()

original = content

# ─── CAMBIO 1: Reemplazar la función buildBrandProductsSubquery ───────────────
# La nueva función retorna { clause, params } donde clause es "p.brand_id = ANY($N::uuid[])"
old_func = '''/**
 * Construye el subquery de IDs de productos cuya marca está en la lista de marcas propias.
 * Retorna { subquery, params } donde subquery usa $N para los brand_ids.
 * startParamIdx: índice del primer parámetro disponible (1-based).
 */
function buildBrandProductsSubquery(brandIds: string[], startParamIdx: number): { subquery: string; params: string[] } {
  if (brandIds.length === 0) {
    return { subquery: "(SELECT NULL::uuid WHERE false)", params: [] };
  }
  const placeholders = brandIds.map((_, i) => `$${startParamIdx + i}`).join(", ");
  return {
    subquery: `(SELECT id FROM public.products WHERE brand_id IN (${placeholders}))`,
    params: brandIds,
  };
}'''

new_func = '''/**
 * Construye el filtro de marca propia usando ANY($N::uuid[]) para máximo rendimiento.
 * Retorna { clause, params } donde clause es "p.brand_id = ANY($N::uuid[])"
 * Esto permite al planner usar el índice index_products_on_brand_id directamente.
 * startParamIdx: índice del primer parámetro disponible (1-based).
 */
function buildBrandFilter(brandIds: string[], startParamIdx: number): { clause: string; params: string[][] } {
  if (brandIds.length === 0) {
    return { clause: "AND false", params: [] };
  }
  return {
    clause: `AND p.brand_id = ANY($${startParamIdx}::uuid[])`,
    params: [brandIds],
  };
}'''

if old_func in content:
    content = content.replace(old_func, new_func)
    print("✓ Función buildBrandProductsSubquery reemplazada por buildBrandFilter")
else:
    print("⚠ No se encontró buildBrandProductsSubquery exacta — verificar manualmente")

# ─── CAMBIO 2: Actualizar los usos de buildBrandProductsSubquery ──────────────
# Patrón: const { subquery, params: brandParams } = buildBrandProductsSubquery(brandIds, 1);
# Nuevo:  const { clause: brandClause, params: brandParams } = buildBrandFilter(brandIds, 1);

old_pattern = 'const { subquery, params: brandParams } = buildBrandProductsSubquery(brandIds, 1);'
new_pattern = 'const { clause: brandClause, params: brandParams } = buildBrandFilter(brandIds, 1);'
count = content.count(old_pattern)
content = content.replace(old_pattern, new_pattern)
print(f"✓ {count} usos de buildBrandProductsSubquery actualizados")

# También hay variantes con startParamIdx diferente
old_pattern2 = 'const { subquery, params: brandParams } = buildBrandProductsSubquery(brandIds,'
count2 = content.count(old_pattern2)
if count2 > 0:
    # Reemplazar todas las variantes
    content = re.sub(
        r'const \{ subquery, params: brandParams \} = buildBrandProductsSubquery\(brandIds, (\d+)\);',
        r'const { clause: brandClause, params: brandParams } = buildBrandFilter(brandIds, \1);',
        content
    )
    print(f"✓ {count2} variantes adicionales de buildBrandProductsSubquery actualizadas")

# ─── CAMBIO 3: Actualizar los parámetros del pool.query ──────────────────────
# Los brandParams ahora son string[][] (array de un elemento que es el array de brand IDs)
# La clave de caché también necesita actualizarse

# Actualizar fromIdx: antes era brandParams.length + 1, ahora siempre es 2 (brandClause usa $1)
# ANTES: const fromIdx = brandParams.length + 1;
# DESPUÉS: const fromIdx = brandParams.length + 1; (sigue siendo correcto, brandParams.length = 1)

# ─── CAMBIO 4: Actualizar las cláusulas WHERE que usan ${subquery} ────────────
# ANTES: WHERE p.id IN ${subquery}
# DESPUÉS: WHERE 1=1 ${brandClause}  (brandClause ya incluye "AND p.brand_id = ANY($1::uuid[])")

# Reemplazar "WHERE p.id IN ${subquery}" por "WHERE 1=1 ${brandClause}"
old_where = 'WHERE p.id IN ${subquery}'
new_where = 'WHERE 1=1 ${brandClause}'
count3 = content.count(old_where)
content = content.replace(old_where, new_where)
print(f"✓ {count3} cláusulas WHERE p.id IN ${{subquery}} actualizadas")

# También hay variantes con espacios diferentes
old_where2 = 'WHERE p.id IN ${subquery}\n'
count4 = content.count(old_where2)
if count4 > 0:
    content = content.replace(old_where2, 'WHERE 1=1 ${brandClause}\n')
    print(f"✓ {count4} variantes adicionales de WHERE actualizadas")

# ─── CAMBIO 5: Actualizar params arrays ──────────────────────────────────────
# ANTES: const params: (string | number | string[])[] = [...brandParams];
# Esto sigue siendo correcto porque brandParams es string[][] y spread lo aplana

# ─── CAMBIO 6: Actualizar cacheKey para usar brandIds directamente ────────────
# El cacheKey usa brandIds.slice().sort().join(",") que sigue siendo válido

# ─── VERIFICACIÓN ─────────────────────────────────────────────────────────────
remaining_old = content.count('buildBrandProductsSubquery')
remaining_subquery = content.count('IN ${subquery}')
remaining_brand_filter = content.count('buildBrandFilter')

print(f"\n=== Verificación ===")
print(f"  buildBrandProductsSubquery restantes: {remaining_old}")
print(f"  IN ${{subquery}} restantes: {remaining_subquery}")
print(f"  buildBrandFilter usos: {remaining_brand_filter}")

if content != original:
    with open(filepath, 'w') as f:
        f.write(content)
    print(f"\n✓ Archivo guardado: {filepath}")
else:
    print(f"\n⚠ Sin cambios en {filepath}")

# Verificar si hay usos de subquery que no se actualizaron
import subprocess
result = subprocess.run(['grep', '-n', 'subquery', filepath], capture_output=True, text=True)
if result.stdout:
    print(f"\nReferencias a 'subquery' restantes:")
    for line in result.stdout.strip().split('\n'):
        print(f"  {line}")
