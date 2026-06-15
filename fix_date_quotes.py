"""
Agregar comillas simples alrededor de las interpolaciones de fecha en template literals TypeScript.
El problema: ${fechaMinDate}::date  →  debe ser  '${fechaMinDate}'::date
"""
import re

files = [
    'server/salesRouter.ts',
    'server/supplierPortalRouter.ts',
    'server/ownBrandRouter.ts',
    'server/targetsRouter.ts',
]

# Variables de fecha que necesitan comillas en SQL
DATE_VARS = [
    'fechaMinDate', 'fechaMaxDate',
    'prevStartStr', 'prevEndStr',
    'fromDate', 'toDate',
    'dateMin', 'dateMax',
    'startDate', 'endDate',
    'minDate', 'maxDate',
    'fechaMin', 'fechaMax',
]

total_fixed = 0

for filepath in files:
    try:
        with open(filepath, 'r') as f:
            content = f.read()
        
        original = content
        count = 0
        
        for var in DATE_VARS:
            # Patrón: ${varName}::date  →  '${varName}'::date
            # Solo cuando NO está ya entre comillas simples
            # Buscar: no precedido por ' y seguido de ::date
            pattern = r'(?<!\')(\$\{' + re.escape(var) + r'\})::date(?!\')'
            replacement = r"'\1'::date"
            new_content = re.sub(pattern, replacement, content)
            if new_content != content:
                diff = len(re.findall(pattern, content))
                count += diff
                content = new_content
        
        if content != original:
            with open(filepath, 'w') as f:
                f.write(content)
            print(f"  {filepath}: {count} reemplazos")
            total_fixed += count
        else:
            print(f"  {filepath}: sin cambios")
    except FileNotFoundError:
        print(f"  {filepath}: no encontrado")

print(f"\nTotal reemplazos: {total_fixed}")

# Verificar que no quedan patrones sin comillas
print("\n=== Verificación final ===")
import subprocess
for filepath in files:
    result = subprocess.run(
        ['grep', '-nP', r'\$\{fecha\w+\}::date|\$\{prev\w+\}::date', filepath],
        capture_output=True, text=True
    )
    if result.stdout:
        print(f"  PENDIENTE en {filepath}:")
        for line in result.stdout.strip().split('\n')[:10]:
            print(f"    {line}")
    else:
        print(f"  OK: {filepath}")
