#!/usr/bin/env python3
"""
Audita todos los routers de la plataforma para detectar el patrón de filtro
de fecha fuera del CTE base (el bug que causaba full scan de 4M filas).

Patrón problemático:
  WITH base AS (
    SELECT ... FROM sales_header sh
    JOIN sales_detail sd ON sd.header_id = sh.id   -- sin filtro de fecha
    WHERE sh.doc_date IS NOT NULL
  )
  SELECT ... FROM base
  WHERE doc_date >= '...'   -- filtro de fecha FUERA del CTE

Patrón correcto:
  WITH filtered_headers AS (
    SELECT ... FROM sales_header sh
    WHERE sh.doc_date >= '...'   -- filtro DENTRO del CTE
  )
  ...
"""

import re
import os

ROUTERS = [
    "server/salesRouter.ts",
    "server/supplierPortalRouter.ts",
    "server/ownBrandRouter.ts",
    "server/targetsRouter.ts",
    "server/ticketsRouter.ts",
    "server/identifiedSalesRouter.ts",
    "server/creditNotesRouter.ts",
    "server/top50Router.ts",
    "server/routers.ts",
]

BASE_DIR = "/home/ubuntu/dashboard-ventas"

def find_queries_with_date_filter_outside_cte(filepath):
    """
    Detecta queries SQL donde:
    1. El CTE base hace JOIN con sales_detail SIN filtro de fecha
    2. El filtro de fecha aparece en el SELECT externo (WHERE doc_date >= ...)
    """
    if not os.path.exists(filepath):
        return []
    
    with open(filepath, "r") as f:
        content = f.read()
    
    issues = []
    
    # Buscar bloques de template literal SQL (entre backticks)
    # Patrón: buscar CTEs que tengan JOIN sales_detail pero sin filtro de fecha
    
    # Detectar queries con CTE base que NO tiene filtro de fecha en el WHERE del CTE
    # pero SÍ tiene JOIN sales_detail
    
    # Patrón 1: WITH base/cte AS ( ... FROM sales_header ... JOIN sales_detail ... WHERE ... IS NOT NULL )
    # seguido de WHERE doc_date >= en el SELECT externo
    
    # Buscar funciones/procedimientos con pool.query
    pool_queries = list(re.finditer(r'pool\.query\s*\(', content))
    
    for match in pool_queries:
        # Extraer el contexto alrededor de la query
        start = max(0, match.start() - 3000)
        end = min(len(content), match.start() + 100)
        context = content[start:end]
        
        # Buscar el nombre del procedimiento tRPC más cercano
        proc_matches = list(re.finditer(r'(\w+)\s*:\s*(?:public|protected)Procedure', context))
        proc_name = proc_matches[-1].group(1) if proc_matches else "unknown"
        
        # Buscar el template literal SQL más cercano antes del pool.query
        sql_start = content.rfind('`', 0, match.start())
        if sql_start == -1:
            continue
        
        # Buscar el inicio del template literal (el backtick de apertura)
        # Necesitamos encontrar el backtick que abre el template literal
        # Buscamos hacia atrás desde sql_start
        sql_content_before = content[max(0, sql_start-5000):sql_start+1]
        
        # Encontrar el backtick de apertura del template literal
        open_bt = sql_content_before.rfind('`\n') 
        if open_bt == -1:
            open_bt = sql_content_before.rfind('= `')
        if open_bt == -1:
            continue
            
        sql_text = sql_content_before[open_bt:]
        
        # Verificar si la query tiene el patrón problemático
        has_join_sales_detail = bool(re.search(r'JOIN\s+sales_detail\s+sd', sql_text, re.IGNORECASE))
        has_sales_header = bool(re.search(r'FROM\s+sales_header\s+sh', sql_text, re.IGNORECASE))
        
        if not (has_join_sales_detail and has_sales_header):
            continue
        
        # Verificar si el filtro de fecha está DENTRO del CTE o FUERA
        # Buscar el CTE base (WITH ... AS (...))
        cte_match = re.search(r'WITH\s+\w+\s+AS\s*\(', sql_text, re.IGNORECASE)
        if not cte_match:
            continue
        
        # Extraer el contenido del CTE base (hasta el cierre del paréntesis)
        cte_start = cte_match.end()
        depth = 1
        cte_end = cte_start
        while cte_end < len(sql_text) and depth > 0:
            if sql_text[cte_end] == '(':
                depth += 1
            elif sql_text[cte_end] == ')':
                depth -= 1
            cte_end += 1
        
        cte_body = sql_text[cte_start:cte_end]
        
        # Verificar si el CTE tiene filtro de fecha
        has_date_filter_in_cte = bool(re.search(
            r'doc_date\s*>=|doc_date\s*BETWEEN|doc_date\s*<|fecha_min|fechaMin',
            cte_body, re.IGNORECASE
        ))
        
        # Verificar si hay filtro de fecha FUERA del CTE (en el SELECT externo)
        after_cte = sql_text[cte_end:]
        has_date_filter_outside = bool(re.search(
            r'WHERE.*doc_date\s*>=|WHERE.*doc_date\s*BETWEEN|AND.*doc_date\s*>=',
            after_cte, re.IGNORECASE
        ))
        
        line_num = content[:match.start()].count('\n') + 1
        
        if not has_date_filter_in_cte and has_date_filter_outside:
            issues.append({
                "file": filepath.replace(BASE_DIR + "/", ""),
                "procedure": proc_name,
                "line": line_num,
                "status": "CRÍTICO: filtro de fecha FUERA del CTE — full scan de sales_detail",
                "has_join": True,
                "date_in_cte": False,
                "date_outside": True,
            })
        elif not has_date_filter_in_cte and not has_date_filter_outside:
            issues.append({
                "file": filepath.replace(BASE_DIR + "/", ""),
                "procedure": proc_name,
                "line": line_num,
                "status": "REVISAR: sin filtro de fecha detectado",
                "has_join": True,
                "date_in_cte": False,
                "date_outside": False,
            })
        else:
            issues.append({
                "file": filepath.replace(BASE_DIR + "/", ""),
                "procedure": proc_name,
                "line": line_num,
                "status": "OK: filtro de fecha dentro del CTE",
                "has_join": True,
                "date_in_cte": True,
                "date_outside": has_date_filter_outside,
            })
    
    return issues

# También hacer una búsqueda más directa: buscar el patrón exacto del bug
def find_exact_bug_pattern(filepath):
    """
    Busca el patrón exacto: 
    - CTE con JOIN sales_detail sin WHERE doc_date
    - Seguido de WHERE doc_date en el SELECT externo
    """
    if not os.path.exists(filepath):
        return []
    
    with open(filepath, "r") as f:
        lines = f.readlines()
    
    content = "".join(lines)
    issues = []
    
    # Buscar bloques SQL (template literals)
    # Patrón: FROM sales_header sh\n...JOIN sales_detail sd...WHERE sh.doc_date IS NOT NULL
    # sin filtro de fecha en el WHERE del CTE
    
    # Buscar CTEs con JOIN sales_detail pero sin filtro de fecha en el CTE
    # El patrón problemático es:
    # WHERE sh.doc_date IS NOT NULL  (sin filtro de rango)
    # seguido más adelante de:
    # WHERE doc_date >= '...'
    
    # Buscar todas las ocurrencias de "JOIN sales_detail"
    for i, line in enumerate(lines):
        if 'JOIN sales_detail sd ON sd.header_id = sh.id' in line or \
           'JOIN sales_detail sd ON sd.header_id=sh.id' in line:
            
            # Buscar hacia atrás el inicio del CTE (WITH ... AS ()
            cte_start_line = i
            for j in range(i, max(0, i-50), -1):
                if re.search(r'WITH\s+\w+\s+AS\s*\(', lines[j], re.IGNORECASE):
                    cte_start_line = j
                    break
            
            # Extraer el bloque del CTE (desde cte_start hasta el cierre)
            cte_block = ""
            depth = 0
            cte_end_line = i
            in_cte = False
            for j in range(cte_start_line, min(len(lines), i + 100)):
                cte_block += lines[j]
                for ch in lines[j]:
                    if ch == '(':
                        depth += 1
                        in_cte = True
                    elif ch == ')':
                        depth -= 1
                        if in_cte and depth == 0:
                            cte_end_line = j
                            break
                if in_cte and depth == 0:
                    break
            
            # Verificar si el CTE tiene filtro de fecha
            has_date_in_cte = bool(re.search(
                r"doc_date\s*>=|doc_date\s*<\s*\(|doc_date\s*BETWEEN|'fechaMin|fechaMinDate",
                cte_block, re.IGNORECASE
            ))
            
            # Verificar si hay filtro de fecha DESPUÉS del CTE
            after_cte = "".join(lines[cte_end_line:min(len(lines), cte_end_line+50)])
            has_date_outside = bool(re.search(
                r"doc_date\s*>=|doc_date\s*<\s*\(|doc_date\s*BETWEEN",
                after_cte, re.IGNORECASE
            ))
            
            # Buscar nombre del procedimiento
            proc_name = "unknown"
            for j in range(max(0, cte_start_line-30), cte_start_line):
                m = re.search(r'(\w+)\s*:\s*(?:public|protected)Procedure', lines[j])
                if m:
                    proc_name = m.group(1)
            
            if not has_date_in_cte and has_date_outside:
                issues.append({
                    "file": filepath.replace(BASE_DIR + "/", ""),
                    "line": i + 1,
                    "procedure": proc_name,
                    "status": "CRÍTICO",
                    "detail": "JOIN sales_detail en CTE sin filtro de fecha → filtro está FUERA del CTE",
                })
            elif not has_date_in_cte and not has_date_outside:
                issues.append({
                    "file": filepath.replace(BASE_DIR + "/", ""),
                    "line": i + 1,
                    "procedure": proc_name,
                    "status": "SIN FILTRO",
                    "detail": "JOIN sales_detail sin ningún filtro de fecha detectado",
                })
            else:
                issues.append({
                    "file": filepath.replace(BASE_DIR + "/", ""),
                    "line": i + 1,
                    "procedure": proc_name,
                    "status": "OK",
                    "detail": "filtro de fecha dentro del CTE ✓",
                })
    
    return issues


print("=" * 80)
print("AUDITORÍA DE FILTROS DE FECHA EN QUERIES SQL")
print("Detectando: JOIN sales_detail en CTE sin filtro de fecha (full scan bug)")
print("=" * 80)

all_issues = []
for router in ROUTERS:
    filepath = os.path.join(BASE_DIR, router)
    issues = find_exact_bug_pattern(filepath)
    all_issues.extend(issues)

# Agrupar por estado
critical = [i for i in all_issues if i["status"] == "CRÍTICO"]
no_filter = [i for i in all_issues if i["status"] == "SIN FILTRO"]
ok = [i for i in all_issues if i["status"] == "OK"]

print(f"\n📊 RESUMEN:")
print(f"  ✅ OK (filtro en CTE):          {len(ok)}")
print(f"  ❌ CRÍTICO (filtro fuera CTE):  {len(critical)}")
print(f"  ⚠️  SIN FILTRO detectado:        {len(no_filter)}")

if critical:
    print(f"\n❌ QUERIES CRÍTICAS (filtro de fecha FUERA del CTE):")
    print("-" * 60)
    for issue in critical:
        print(f"  Archivo:    {issue['file']}")
        print(f"  Línea:      {issue['line']}")
        print(f"  Procedure:  {issue['procedure']}")
        print(f"  Problema:   {issue['detail']}")
        print()

if no_filter:
    print(f"\n⚠️  QUERIES SIN FILTRO DE FECHA:")
    print("-" * 60)
    for issue in no_filter:
        print(f"  Archivo:    {issue['file']}")
        print(f"  Línea:      {issue['line']}")
        print(f"  Procedure:  {issue['procedure']}")
        print(f"  Detalle:    {issue['detail']}")
        print()

if ok:
    print(f"\n✅ QUERIES CORRECTAS:")
    print("-" * 60)
    for issue in ok:
        print(f"  {issue['file']}:{issue['line']} [{issue['procedure']}] — {issue['detail']}")

print("\n" + "=" * 80)
print("FIN DE AUDITORÍA")
print("=" * 80)
