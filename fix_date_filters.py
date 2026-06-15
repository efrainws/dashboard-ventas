"""
Reemplaza el patrón lento doc_date::date >= 'X'::date AND doc_date::date <= 'Y'::date
por el patrón rápido de rango de timestamp en todos los routers.

Mejora medida: 27.7s → 0.15s (180x más rápido) para un solo día.

Patrones a reemplazar:
1. sh.doc_date::date >= '${X}'::date\n  AND sh.doc_date::date <= '${Y}'::date
   → sh.doc_date >= '${X}'::date AND sh.doc_date < ('${Y}'::date + INTERVAL '1 day')

2. sh.doc_date::date >= '${X}'::date AND sh.doc_date::date <= '${Y}'::date (en línea)
   → sh.doc_date >= '${X}'::date AND sh.doc_date < ('${Y}'::date + INTERVAL '1 day')

3. DATE(sh.doc_date) >= '${X}'::date\n  AND DATE(sh.doc_date) <= '${Y}'::date
   → sh.doc_date >= '${X}'::date AND sh.doc_date < ('${Y}'::date + INTERVAL '1 day')

4. sh.doc_date::date BETWEEN $N AND $M
   → sh.doc_date >= $N::date AND sh.doc_date < ($M::date + INTERVAL '1 day')

5. sh.doc_date::date >= $N::date AND sh.doc_date::date <= $M::date (con parámetros)
   → sh.doc_date >= $N::date AND sh.doc_date < ($M::date + INTERVAL '1 day')
"""

import re
import os

FILES = [
    "server/salesRouter.ts",
    "server/supplierPortalRouter.ts",
    "server/ownBrandRouter.ts",
    "server/targetsRouter.ts",
]

def fix_file(path: str) -> int:
    with open(path, "r") as f:
        content = f.read()

    original = content
    changes = 0

    # ── Patrón 1: template literal con variable, multi-línea ──────────────
    # sh.doc_date::date >= '${fechaMinDate}'::date
    #   AND sh.doc_date::date <= '${fechaMaxDate}'::date
    # → sh.doc_date >= '${fechaMinDate}'::date AND sh.doc_date < ('${fechaMaxDate}'::date + INTERVAL '1 day')
    def replace_template_multiline(m):
        nonlocal changes
        changes += 1
        min_var = m.group(1)
        max_var = m.group(2)
        return f"sh.doc_date >= '{{{min_var}}}'::date AND sh.doc_date < ('{{{max_var}}}'::date + INTERVAL '1 day')"

    content, n = re.subn(
        r"sh\.doc_date::date\s*>=\s*'\$\{(\w+)\}'::date\s*\n\s*AND\s+sh\.doc_date::date\s*<=\s*'\$\{(\w+)\}'::date",
        replace_template_multiline,
        content,
    )
    changes += n

    # ── Patrón 2: template literal con variable, en línea ─────────────────
    # sh.doc_date::date >= '${X}'::date AND sh.doc_date::date <= '${Y}'::date
    def replace_template_inline(m):
        nonlocal changes
        changes += 1
        min_var = m.group(1)
        max_var = m.group(2)
        return f"sh.doc_date >= '{{{min_var}}}'::date AND sh.doc_date < ('{{{max_var}}}'::date + INTERVAL '1 day')"

    content, n = re.subn(
        r"sh\.doc_date::date\s*>=\s*'\$\{(\w+)\}'::date\s+AND\s+sh\.doc_date::date\s*<=\s*'\$\{(\w+)\}'::date",
        replace_template_inline,
        content,
    )
    changes += n

    # ── Patrón 3: DATE(sh.doc_date) con template literal, multi-línea ─────
    # DATE(sh.doc_date) >= '${X}'::date
    #   AND DATE(sh.doc_date) <= '${Y}'::date
    def replace_date_fn_multiline(m):
        nonlocal changes
        changes += 1
        min_var = m.group(1)
        max_var = m.group(2)
        return f"sh.doc_date >= '{{{min_var}}}'::date AND sh.doc_date < ('{{{max_var}}}'::date + INTERVAL '1 day')"

    content, n = re.subn(
        r"DATE\(sh\.doc_date\)\s*>=\s*'\$\{(\w+)\}'::date\s*\n\s*AND\s+DATE\(sh\.doc_date\)\s*<=\s*'\$\{(\w+)\}'::date",
        replace_date_fn_multiline,
        content,
    )
    changes += n

    # ── Patrón 4: DATE(sh.doc_date) con template literal, en línea ────────
    def replace_date_fn_inline(m):
        nonlocal changes
        changes += 1
        min_var = m.group(1)
        max_var = m.group(2)
        return f"sh.doc_date >= '{{{min_var}}}'::date AND sh.doc_date < ('{{{max_var}}}'::date + INTERVAL '1 day')"

    content, n = re.subn(
        r"DATE\(sh\.doc_date\)\s*>=\s*'\$\{(\w+)\}'::date\s+AND\s+DATE\(sh\.doc_date\)\s*<=\s*'\$\{(\w+)\}'::date",
        replace_date_fn_inline,
        content,
    )
    changes += n

    # ── Patrón 5: BETWEEN con parámetros posicionales ($N AND $M) ─────────
    # sh.doc_date::date BETWEEN $2 AND $3
    # → sh.doc_date >= $2::date AND sh.doc_date < ($3::date + INTERVAL '1 day')
    def replace_between(m):
        nonlocal changes
        changes += 1
        p1 = m.group(1)
        p2 = m.group(2)
        return f"sh.doc_date >= {p1}::date AND sh.doc_date < ({p2}::date + INTERVAL '1 day')"

    content, n = re.subn(
        r"sh\.doc_date::date\s+BETWEEN\s+(\$\d+)\s+AND\s+(\$\d+)",
        replace_between,
        content,
    )
    changes += n

    # ── Patrón 6: parámetros posicionales con ::date, multi-línea ─────────
    # sh.doc_date::date >= $N::date
    #   AND sh.doc_date::date <= $M::date
    def replace_param_multiline(m):
        nonlocal changes
        changes += 1
        p1 = m.group(1)
        p2 = m.group(2)
        return f"sh.doc_date >= {p1}::date AND sh.doc_date < ({p2}::date + INTERVAL '1 day')"

    content, n = re.subn(
        r"sh\.doc_date::date\s*>=\s*(\$\d+)::date\s*\n\s*AND\s+sh\.doc_date::date\s*<=\s*(\$\d+)::date",
        replace_param_multiline,
        content,
    )
    changes += n

    # ── Patrón 7: parámetros posicionales con ::date, en línea ────────────
    def replace_param_inline(m):
        nonlocal changes
        changes += 1
        p1 = m.group(1)
        p2 = m.group(2)
        return f"sh.doc_date >= {p1}::date AND sh.doc_date < ({p2}::date + INTERVAL '1 day')"

    content, n = re.subn(
        r"sh\.doc_date::date\s*>=\s*(\$\d+)::date\s+AND\s+sh\.doc_date::date\s*<=\s*(\$\d+)::date",
        replace_param_inline,
        content,
    )
    changes += n

    # ── Patrón 8: DATE(sh.doc_date) con parámetros posicionales ───────────
    # DATE(sh.doc_date) >= $1::date AND DATE(sh.doc_date) <= $2::date
    def replace_date_fn_param(m):
        nonlocal changes
        changes += 1
        p1 = m.group(1)
        p2 = m.group(2)
        return f"sh.doc_date >= {p1}::date AND sh.doc_date < ({p2}::date + INTERVAL '1 day')"

    content, n = re.subn(
        r"DATE\(sh\.doc_date\)\s*>=\s*(\$\d+)::date\s*\n?\s*AND\s+DATE\(sh\.doc_date\)\s*<=\s*(\$\d+)::date",
        replace_date_fn_param,
        content,
    )
    changes += n

    # ── Patrón 9: DATE(sh.doc_date) con string literal ────────────────────
    # DATE(sh.doc_date) >= '${X}'::date AND DATE(sh.doc_date) <= '${Y}'::date
    # (ya cubierto arriba, pero con variante sin espacio)
    content, n = re.subn(
        r"DATE\(sh\.doc_date\)\s*>=\s*'\$\{(\w+)\}'::date\s*\n\s*AND\s+DATE\(sh\.doc_date\)\s*<=\s*'\$\{(\w+)\}'::date",
        lambda m: f"sh.doc_date >= '{{{m.group(1)}}}'::date AND sh.doc_date < ('{{{m.group(2)}}}'::date + INTERVAL '1 day')",
        content,
    )
    changes += n

    # ── Patrón 10: CASE WHEN con doc_date::date (para comparación de períodos) ──
    # WHEN sh.doc_date::date >= '${X}'::date AND sh.doc_date::date <= '${Y}'::date
    # → WHEN sh.doc_date >= '${X}'::date AND sh.doc_date < ('${Y}'::date + INTERVAL '1 day')
    def replace_case_when(m):
        nonlocal changes
        changes += 1
        min_var = m.group(1)
        max_var = m.group(2)
        return f"WHEN sh.doc_date >= '{{{min_var}}}'::date AND sh.doc_date < ('{{{max_var}}}'::date + INTERVAL '1 day')"

    content, n = re.subn(
        r"WHEN\s+sh\.doc_date::date\s*>=\s*'\$\{(\w+)\}'::date\s+AND\s+sh\.doc_date::date\s*<=\s*'\$\{(\w+)\}'::date",
        replace_case_when,
        content,
    )
    changes += n

    # ── Patrón 11: OR condition con doc_date::date ─────────────────────────
    # (sh.doc_date::date >= '${X}'::date AND sh.doc_date::date <= '${Y}'::date)
    def replace_paren_condition(m):
        nonlocal changes
        changes += 1
        min_var = m.group(1)
        max_var = m.group(2)
        return f"(sh.doc_date >= '{{{min_var}}}'::date AND sh.doc_date < ('{{{max_var}}}'::date + INTERVAL '1 day'))"

    content, n = re.subn(
        r"\(sh\.doc_date::date\s*>=\s*'\$\{(\w+)\}'::date\s+AND\s+sh\.doc_date::date\s*<=\s*'\$\{(\w+)\}'::date\)",
        replace_paren_condition,
        content,
    )
    changes += n

    # ── Patrón 12: sh2.doc_date::date (tabla con alias diferente) ─────────
    # DATE(sh2.doc_date) >= '${X}'::date AND DATE(sh2.doc_date) <= '${Y}'::date
    def replace_sh2_date(m):
        nonlocal changes
        changes += 1
        min_var = m.group(1)
        max_var = m.group(2)
        return f"sh2.doc_date >= '{{{min_var}}}'::date AND sh2.doc_date < ('{{{max_var}}}'::date + INTERVAL '1 day')"

    content, n = re.subn(
        r"DATE\(sh2\.doc_date\)\s*>=\s*'\$\{(\w+)\}'::date\s*\n?\s*AND\s+DATE\(sh2\.doc_date\)\s*<=\s*'\$\{(\w+)\}'::date",
        replace_sh2_date,
        content,
    )
    changes += n

    # ── Patrón 13: sh2.doc_date::date con template literal ────────────────
    def replace_sh2_cast(m):
        nonlocal changes
        changes += 1
        min_var = m.group(1)
        max_var = m.group(2)
        return f"sh2.doc_date >= '{{{min_var}}}'::date AND sh2.doc_date < ('{{{max_var}}}'::date + INTERVAL '1 day')"

    content, n = re.subn(
        r"sh2\.doc_date::date\s*>=\s*'\$\{(\w+)\}'::date\s*\n?\s*AND\s+sh2\.doc_date::date\s*<=\s*'\$\{(\w+)\}'::date",
        replace_sh2_cast,
        content,
    )
    changes += n

    # ── Patrón 14: parámetros posicionales sin ::date en el valor ─────────
    # sh.doc_date::date >= $N AND sh.doc_date::date <= $M (sin ::date en el valor)
    def replace_param_no_cast(m):
        nonlocal changes
        changes += 1
        p1 = m.group(1)
        p2 = m.group(2)
        return f"sh.doc_date >= {p1}::date AND sh.doc_date < ({p2}::date + INTERVAL '1 day')"

    content, n = re.subn(
        r"sh\.doc_date::date\s*>=\s*(\$\d+)\s+AND\s+sh\.doc_date::date\s*<=\s*(\$\d+)(?!::)",
        replace_param_no_cast,
        content,
    )
    changes += n

    if content != original:
        with open(path, "w") as f:
            f.write(content)
        print(f"  ✓ {path}: {changes} reemplazos aplicados")
    else:
        print(f"  - {path}: sin cambios")

    return changes

total = 0
for f in FILES:
    print(f"\n=== {f} ===")
    total += fix_file(f)

print(f"\n=== TOTAL: {total} reemplazos en {len(FILES)} archivos ===")

# Verificar que no quedan patrones antiguos
print("\n=== VERIFICACIÓN: patrones restantes ===")
for f in FILES:
    with open(f) as fh:
        content = fh.read()
    remaining = re.findall(r"doc_date::date\s*>=|DATE\(sh\.doc_date\)\s*>=|doc_date::date\s+BETWEEN", content)
    if remaining:
        print(f"  ⚠ {f}: {len(remaining)} patrones restantes")
        # Mostrar contexto
        for m in re.finditer(r".{0,50}(doc_date::date\s*>=|DATE\(sh\.doc_date\)\s*>=|doc_date::date\s+BETWEEN).{0,50}", content):
            print(f"    → {m.group().strip()}")
    else:
        print(f"  ✓ {f}: limpio")
