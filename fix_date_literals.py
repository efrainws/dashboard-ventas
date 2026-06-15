"""
Corregir los literales incorrectos de fecha introducidos por el script anterior.
El script de reemplazo convirtió ${fechaMinDate} a '{fechaMinDate}' (literal SQL).
Debemos revertir eso a ${fechaMinDate} (interpolación TypeScript).

Patrón incorrecto: '{fechaMinDate}'::date
Patrón correcto:   ${fechaMinDate}::date   (dentro de template literal TypeScript)
"""
import re

files = [
    'server/salesRouter.ts',
    'server/supplierPortalRouter.ts',
    'server/ownBrandRouter.ts',
    'server/targetsRouter.ts',
]

# Variables que fueron incorrectamente convertidas a literales SQL
# Formato incorrecto: '{varName}'::date  o  ('{varName}'::date + INTERVAL ...)
# Formato correcto:   ${varName}::date   o  (${varName}::date + INTERVAL ...)
VARS_TO_FIX = [
    'fechaMinDate',
    'fechaMaxDate', 
    'prevStartStr',
    'prevEndStr',
    'fromDate',
    'toDate',
    'dateMin',
    'dateMax',
    'startDate',
    'endDate',
    'minDate',
    'maxDate',
    'fechaMin',
    'fechaMax',
    'from',
    'to',
]

total_fixed = 0

for filepath in files:
    try:
        with open(filepath, 'r') as f:
            content = f.read()
        
        original = content
        count = 0
        
        for var in VARS_TO_FIX:
            # Patrón: '{varName}'::date  →  ${varName}::date
            pattern = f"'\\{{{var}\\}}'::date"
            replacement = f"${{{var}}}::date"
            new_content = content.replace(f"'{{{var}}}'::date", f"${{{var}}}::date")
            if new_content != content:
                diff = content.count(f"'{{{var}}}'::date")
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

# Verificar que no quedan literales incorrectos
print("\n=== Verificación final ===")
import subprocess
for filepath in files:
    result = subprocess.run(
        ['grep', '-n', "'{fechaMinDate}'\|'{fechaMaxDate}'\|'{prevStartStr}'\|'{prevEndStr}'", filepath],
        capture_output=True, text=True
    )
    if result.stdout:
        print(f"  PENDIENTE en {filepath}:")
        print(result.stdout[:500])
    else:
        print(f"  OK: {filepath}")
