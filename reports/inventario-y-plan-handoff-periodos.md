# Inventario y plan de impacto: períodos, filtros URL y comparativos temporales

**Estado:** Punto de control obligatorio de análisis. Este informe describe el estado restaurado del repositorio y propone la implementación. **No se ha modificado código funcional, contratos de API, modelos ni migraciones** como parte de esta auditoría.

## Conclusión ejecutiva

El handoff define un cambio transversal, pero delimitado: once rutas reciben estado aplicado desde URL y períodos predeterminados; seis de ellas incorporan o actualizan comparativos temporales en elementos concretos. Las otras cinco deben conservar una sola dimensión temporal. La implementación necesita una utilidad compartida de bajo alcance para validar períodos y URL, además de adaptadores por página. No es aconsejable reemplazar `FiltersContext` ni crear un nuevo estado global de filtros sin confirmación: las rutas pueden reconstruir su estado aplicado desde la URL mediante un hook compartido y conservar sus filtros propios. [1] [2] [4]

Las rutas comparativas son **P01 Análisis General**, **P02 Análisis por Horas**, **P04 Top Productos**, **P05 Top Clientes**, **P06 Análisis por Góndola** y **P07 Análisis por Categorías**. P03, P08, P09, P10 y P11 no deben obtener un segundo período, aunque sí deben adoptar URL, aplicación y restablecimiento de filtros. [1]

> El Mapa de calor de P02 y el Mapa de tienda/heatmap P06-E09 quedan fuera del nuevo comparativo global. En particular, P06-E09 conservará su comportamiento actual de comparación automática sin consumir el nuevo rango personalizado.

## Matriz de alcance por página

| ID | Ruta | Período predeterminado requerido | Elementos que cambian | Elementos que se conservan |
|---|---|---|---|---|
| P01 | `/sales` | 30 fechas completas, desde hace 30 días hasta ayer | E01–E04, E06–E09 | E05 Proyección mensual y E10 Información de datos |
| P02 | `/hourly` | 30 fechas completas, desde hace 30 días hasta ayer | E01–E04 | E05 Mapa de calor y E06 Ventas por hora |
| P03 | `/sales-vs-target` | Mes actual hasta ayer; el día 1, mes anterior completo | URL y dinámica de filtros solamente | Comparaciones contra meta; ningún comparativo temporal |
| P04 | `/top-products` | 30 fechas completas, desde hace 30 días hasta ayer | E01–E05 | E06–E09 |
| P05 | `/top-customers` | Conservar el comportamiento actual: hoy − 30 días hasta hoy | E04–E05 | E01–E03 y E06–E08, incluido detalle de cliente |
| P06 | `/sales-by-shelf` | 15 fechas completas hasta ayer | E01, E02, E07, E08 y E10 | E03–E06 y E09 Mapa de tienda |
| P07 | `/sales-by-category` | 15 fechas completas hasta ayer | E01 Evolución de ventas | E02–E04 |
| P08 | `/credit-notes` | Mes actual hasta ayer; el día 1, mes anterior completo | URL y dinámica de filtros solamente | Todo comparativo temporal |
| P09 | `/identified-transactions` | Mes actual hasta ayer; el día 1, mes anterior completo | URL y dinámica de filtros solamente | Todo comparativo temporal |
| P10 | `/supplier` | Mes actual hasta ayer; el día 1, mes anterior completo | URL y dinámica de filtros solamente | Toda dimensión comparativa temporal |
| P11 | `/marca-propia` | Mes actual hasta ayer; el día 1, mes anterior completo | URL y dinámica de filtros solamente | Toda dimensión comparativa temporal |

Las rutas y los componentes existentes confirman que P01, P02 y P06 ya calculan un período anterior automático dentro de consultas de ventas. P04, P05 y P07 no tienen comparación temporal vigente, por lo que requieren una presentación y contratos nuevos, solo para los elementos identificados. P03 compara ventas con metas, no con un período temporal; esa lógica se mantiene. [1] [5] [6]

## Estado actual de filtros, URL y períodos

La mayoría de las páginas actualizan las consultas en el mismo instante en que se modifica un control. P07 ya distingue parcialmente controles pendientes y aplicados, pero no usa URL ni contempla comparación. `FiltersContext` conserva únicamente fecha y sucursal en memoria. `IgvContext` persiste IGV en `sessionStorage`, lo que contradice el requisito de reconstruir filtros aplicados desde URL si IGV sigue considerándose un filtro de datos. Ninguna de las once rutas reconstruye actualmente sus filtros desde parámetros URL, y los enlaces del menú no propagan parámetros. [2] [3] [4]

Los defaults actuales son inconsistentes con el handoff. P01 y P02 empiezan en ayer; P04 termina hoy; P07 no consulta resultados hasta pulsar Aplicar; y P03, P08, P09, P10 y P11 calculan un rango invertido el primer día del mes. P05 debe ser la excepción: se conserva exactamente su rango actual, aunque el texto visible lo denomine “últimos 30 días” y el conteo inclusivo abarque 31 fechas.

En P10 y P11 existen dos flujos con ventanas propias: la tendencia mensual fija de seis meses y las recepciones con ventana de 90 días. El handoff no las nombra como elementos modificables. Bajo la regla “lo no declarado no se cambia”, el plan las conserva sin cambios, aunque se documentan como una ambigüedad porque no usan el período principal de la página. [1] [7] [8]

## Comparativos existentes y contratos de datos

Los procedimientos `sales.getAggregatedComparison`, `sales.getHourlyComparison`, `sales.getBranchComparison`, `sales.getCategoryComparison` y `sales.getSalesByShelfComparison` reciben únicamente el período principal. Cada uno calcula internamente el bloque anterior de igual duración. Esta conducta satisface el comparativo predeterminado, pero no admite los rangos explícitos de días exactos ni meses completos. Además, los filtros de canales, IGV y categoría no se propagan de forma homogénea en todas las comparaciones actuales. [5]

P01 necesita una segunda serie de línea y comparaciones completas en sucursal, categoría y canal. P02 solo necesita actualizar sus cuatro KPIs, sin tocar el mapa de calor. P04 y P05 requieren dos rankings independientes y valores cruzados por entidad aunque esa entidad quede fuera del límite del otro ranking. P06 necesita aislar P06-E09: no se puede reutilizar ni cambiar su comparación automática para alimentar el nuevo comparativo global. P07 requiere una segunda serie únicamente para Evolución de Ventas. [1]

## Esquema propuesto de URL

La propuesta mantiene los nombres de fechas y filtros ya usados por los contratos de ventas. Los filtros no reconocidos por una página permanecen inofensivos en la URL y no afectan sus consultas. Ningún parámetro de seguridad puede sustituir el alcance que el servidor obliga para `store_user`, proveedor o marca.

### Rutas P01–P09

| Propósito | Parámetros propuestos |
|---|---|
| Principal en días | `fecha_min`, `fecha_max` |
| Comparativo en días | `modalidad_comparacion=dias`, `comparacion_fecha_min`, `comparacion_fecha_max` |
| Meses completos | `modalidad_comparacion=meses`, `meses_principales=YYYY-MM,YYYY-MM`, `meses_comparativos=YYYY-MM,YYYY-MM` |
| Aviso de navegación transitorio | `aviso_periodo=conservado` o `aviso_periodo=predeterminado` |
| Filtros propios | Solo nombres que ya representa la página, por ejemplo `branch_id`, `branch_sap_id`, `category_id`, `dept_id`, `seccion_id`, `familia_id`, `channels`, `store_ids`, `top_n` e `include_igv` |

En modalidad de días no se emiten parámetros mensuales. En modalidad de meses no se emiten parámetros de comparación diaria. Para P03, P08 y P09 no se admiten parámetros de comparación. Los parámetros incompletos o inválidos se descartan; si el principal es inválido se aplica el default de la página y, si únicamente falla el comparativo, se conserva el principal con el mensaje **“Selecciona nuevamente el periodo comparativo.”**

### Rutas P10 y P11

Los portales ya usan `from` y `to` en sus routers, por lo que conservarían esos nombres. Podrán incluir `tab` y los filtros locales que ya cambian datos, como proveedor, categoría, producto, tienda, canal e IGV. No aceptarán ni emitirán parámetros comparativos. [7] [8]

## Diseño técnico propuesto

La alternativa de menor impacto consiste en añadir una utilidad pura compartida, por ejemplo `shared/temporalFilterState.ts`. Esta incluiría defaults por identificador canónico, el conteo inclusivo, validación de días exactos, validación de meses cerrados consecutivos, cálculo del período anterior, desfase de inicio, división porcentual segura y parseo/serialización de URL. No reemplazaría los contextos existentes ni modificará datos remotos.

Cada página usaría un hook de interfaz común para mantener dos objetos locales: **borrador** y **aplicado**. El aplicado se deriva de la URL. `Aplicar filtros` validaría el borrador y escribiría la URL en una sola operación. `Restablecer filtros` generaría el default de su página, limpiaría filtros opcionales y seguiría el mismo flujo. Mientras se actualizan consultas se conservarían los datos anteriores mediante el patrón de datos previos de React Query, con un indicador de carga local al bloque afectado.

La navegación se concentraría en un helper de enlace usado por `NavigationMenu`. Con identificadores iguales —P01/P02/P04, P06/P07 y P03/P08/P09/P10/P11— conserva parámetros temporales y muestra el aviso de conservación. Con identificadores distintos, sustituye solo los temporales por el default del destino, mantiene los no temporales y muestra el aviso de restablecimiento. P05 conserva su identificador propio y siempre aplica esa segunda regla. [1] [3]

## Plan de implementación por bloques

### Bloque 1 — Fundaciones de estado y navegación

Crear las utilidades temporales puras y las pruebas de defaults, URL, días exactos, meses completos, traslapes, divisores cero y parámetros inválidos. Adaptar la navegación para conservar o reemplazar solo la parte temporal. En esta etapa no se cambiarían consultas ni resultados comparativos.

**Archivos previstos:** `shared/temporalFilterState.ts`, sus pruebas, un hook de cliente para URL aplicada, `NavigationMenu.tsx`, `App.tsx` y los paneles de filtros de P01–P11. `FiltersContext` se mantiene durante la transición, pero las rutas adaptadas dejan de usarlo como fuente de consultas.

### Bloque 2 — P01 y P02

Actualizar defaults, filtros aplicados y URL. Extender los procedimientos de comparación para recibir rangos explícitos y los mismos filtros de ambas consultas. En P01 se agregan la segunda serie de línea y las presentaciones comparativas aprobadas para E01–E04 y E06–E09. En P02 se actualizan únicamente E01–E04. El mapa de calor y la línea horaria tendrán pruebas de no regresión.

### Bloque 3 — P04 y P05

Crear contratos de rankings emparejados por entidad. Cada contrato debe devolver rankings independientes para principal y comparativo, además de los valores reales de la entidad fuera del límite opuesto. Se presentan tarjetas y tablas dobles solo en los elementos definidos. El modal de detalle de cliente se mantiene asociado al período principal aplicado.

### Bloque 4 — P06 y P07

Crear un contrato comparativo dedicado para P06 sin modificar el procedimiento o la visualización que usa P06-E09. Actualizar E01, E02, E07, E08 y E10 con flechas y tooltips completos. Para P07, extender solo la evolución de ventas con una segunda serie y tooltip comparativo; el pie y la tabla conservan el período principal.

### Bloque 5 — P03, P08, P09, P10 y P11

Aplicar defaults, URL, borrador/aplicado, restablecimiento, navegación y retención de resultados. No se crearán endpoints de comparación, columnas, flechas, tooltips ni series adicionales. Mantener las restricciones de rol y los flujos de detalle existentes.

### Bloque 6 — Validación

Ejecutar pruebas unitarias de lógica temporal, contratos tRPC y pruebas representativas de interfaz. Se comprobarán recarga, enlace compartido, Atrás/Adelante, edición sin aplicar, restablecimiento, primer día de mes, datos parciales, fallo aislado del comparativo, alcance de `store_user`, responsive y teclado. También se verificarán explícitamente las exclusiones P02-E05, P06-E09, P08, P09, P10 y P11.

## Decisiones de confirmación requeridas

La implementación de los bloques anteriores modifica estado compartido de navegación, contratos de consultas comparativas y la representación de rankings. Por tanto, requiere tu confirmación previa. Las decisiones ya están determinadas por el handoff, salvo estas tres precisiones operativas:

1. **IGV:** propongo tratarlo como filtro de datos aplicado y serializarlo en URL para las rutas que lo utilizan; las rutas adaptadas dejarían de depender de `sessionStorage` para reconstruir resultados.
2. **P10 y P11:** propongo conservar sin cambios la tendencia mensual de seis meses y las recepciones de 90 días, porque el handoff no las declara como modificables. Seguirán sin comparación temporal.
3. **P06-E09:** propongo conservar de forma aislada su comparación automática actual, sin conectarla al selector comparativo nuevo, para cumplir simultáneamente “no modificar” y “desconectado del nuevo comparativo global”.

## Diferencias encontradas frente al handoff

El repositorio restaurado no implementa aún URL como fuente de estado, navegación por identificadores, controles pendiente/aplicado, restablecimiento dirigido por URL ni las dos modalidades comparativas. La mayor parte de las comparaciones actuales se deriva automáticamente en el servidor y no recibe un rango explícito. P07 es la única página que ya separa parcialmente borrador y aplicado, pero su default y su URL no cumplen el handoff. Los portales no contienen comparativos, lo cual sí coincide con la especificación. [1] [5] [6] [7] [8]

## Referencias

[1]: file:///home/ubuntu/upload/pasted_content_2.txt "Handoff final de períodos, filtros URL y comparativos temporales"
[2]: file:///home/ubuntu/dashboard-ventas/client/src/App.tsx "Rutas y proveedores de filtros de la aplicación"
[3]: file:///home/ubuntu/dashboard-ventas/client/src/components/NavigationMenu.tsx "Navegación principal del dashboard"
[4]: file:///home/ubuntu/dashboard-ventas/client/src/contexts/FiltersContext.tsx "Contexto de filtros actual"
[5]: file:///home/ubuntu/dashboard-ventas/server/salesRouter.ts "Consultas de ventas y períodos anteriores"
[6]: file:///home/ubuntu/dashboard-ventas/server/categoryAnalysisRouter.ts "Consultas del análisis por categorías"
[7]: file:///home/ubuntu/dashboard-ventas/server/supplierPortalRouter.ts "Consultas del Portal de Proveedores"
[8]: file:///home/ubuntu/dashboard-ventas/server/ownBrandRouter.ts "Consultas del Portal Marca Propia"
