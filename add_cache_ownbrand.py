"""
Agregar caché TTL.DYNAMIC (60s) a las queries de ventas del ownBrandRouter
que aún no tienen caché: getSalesSummary, getDailySales, getTopProducts,
getSalesByBranch, getSalesByCategory, getSalesByProductBranch, getSalesDailyDetail,
getSalesEvolution, getStockByProduct, getReceptions, getProductCatalog.
"""
import re

filepath = 'server/ownBrandRouter.ts'
with open(filepath, 'r') as f:
    content = f.read()

original = content

# Verificar qué queries ya tienen caché
cached_count = content.count('return cached(')
print(f"Queries con caché actualmente: {cached_count}")

# Verificar queries sin caché
no_cache = [
    'getSalesSummary',
    'getDailySales', 
    'getTopProducts',
    'getSalesByBranch',
    'getSalesByCategory',
    'getSalesByProductBranch',
    'getSalesDailyDetail',
    'getSalesEvolution',
    'getStockByProduct',
    'getReceptions',
    'getProductCatalog',
]

for q in no_cache:
    idx = content.find(f'{q}:')
    if idx == -1:
        print(f"  ⚠ {q}: no encontrado")
        continue
    # Buscar si hay 'return cached(' en los próximos 200 chars
    snippet = content[idx:idx+300]
    has_cache = 'return cached(' in snippet
    print(f"  {'✓' if has_cache else '✗'} {q}: {'tiene caché' if has_cache else 'SIN caché'}")

print(f"\n✓ Análisis completado")
