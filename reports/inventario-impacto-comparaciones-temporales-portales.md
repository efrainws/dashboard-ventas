# Inventario de impacto: comparaciones temporales personalizables

**Fecha de revisión:** 30 de septiembre de 2026  
**Alcance revisado:** Portal de Proveedores (`/supplier`) y Portal Marca Propia (`/marca-propia`)  
**Estado:** Punto de control 1 — inventario y plan previo. **No se modificó código.**

---

## 1. Conclusión ejecutiva

> **Hallazgo crítico:** ninguno de los componentes de los portales de Proveedores o Marca Propia compara actualmente dos períodos temporales. Ambos consumen un único rango principal y, por lo tanto, no hay un componente del portal que pueda recibir el período comparativo personalizado sin crear una comparación nueva.

Esto entra en tensión con dos reglas del requerimiento:

1. La comparación personalizada debe estar disponible en ambos portales.
2. No se deben crear comparativos en elementos que hoy solo muestran el período principal.

Por esa razón, la implementación de una comparación personalizada en los portales requiere una **decisión funcional explícita** antes de editar contratos, URLs, estado o consultas. La recomendación es respetar la segunda regla: implementar la dinámica de **Aplicar filtros + URL** en ambos portales, pero no agregar un segundo período ni variaciones a sus KPIs, gráficos, tablas o rankings mientras no se identifique o apruebe un comparativo concreto.

---

## 2. Clasificación de impacto

| Clasificación | Resultado del inventario |
|---|---|
| **Afectados por la nueva comparación** | **Ninguno.** Los dos portales no muestran `vs período anterior`, variación, doble serie ni datos de período previo. |
| **Afectados únicamente por “Aplicar filtros”** | Dashboard y Ventas de ambos portales: hoy actualizan consultas inmediatamente al cambiar fechas y filtros. |
| **Expresamente excluidos** | Stock, Catálogo, configuración de marcas/categorías y cualquier componente que no tenga período temporal. Mapa de calor: no existe dentro de estos portales y no se tocará. |
| **Pendientes de definición** | Gráfico histórico de últimos 6 meses; recepciones/entregas con ventana independiente de 90 días; alcance de filtros por pestaña; y si se autoriza crear comparativos nuevos en los portales. |

---

## 3. Inventario funcional por portal

### 3.1 Portal de Proveedores — `/supplier`

**Archivo principal:** `client/src/pages/SupplierPortal.tsx`  
**Período predeterminado actual:** desde el primer día del mes actual hasta ayer, calculado localmente con `startOfMonth(new Date())` y `subDays(new Date(), 1)`.

| Área / pestaña | Elemento | Filtros actuales | Compara períodos hoy | Clasificación | Observación de impacto |
|---|---|---|---|---|---|
| Dashboard | KPIs: ventas, tickets, unidades, productos vendidos, tiendas activas | Fecha e IGV | No | Aplicar filtros | Consume `getSalesSummary` con un único período. |
| Dashboard | Tendencia de ventas diarias | Fecha e IGV | No | Aplicar filtros | Consume `getDailySales`; una única serie temporal. |
| Dashboard | Ventas por mes — últimos 6 meses | Ninguno de los controles de fecha visibles | No | Pendiente | `getMonthlySales` está fijado en servidor a `NOW() - INTERVAL '6 months'`; no usa `from`, `to` ni IGV. |
| Dashboard | Análisis por canal | Fecha e IGV | No | Aplicar filtros | `ChannelBreakdown` calcula participación, ticket, promedio diario y proyección solo para el período principal. |
| Dashboard | Top 10 productos | Fecha e IGV | No | Aplicar filtros | `getTopProducts` consume un período. |
| Dashboard | Ventas por tienda | Fecha e IGV | No | Aplicar filtros | `getSalesByBranch` consume un período. |
| Ventas | Ventas por artículo y tienda | Fecha, producto, tienda, canal, IGV y dimensiones visibles | No | Aplicar filtros | Consulta paginada, exportación y total general se actualizan de inmediato. |
| Ventas | Evolución de ventas (línea) | Mismos filtros de Ventas | No | Aplicar filtros | `getSalesLineChart` consume un período, con granularidad día/semana/mes. |
| Ventas | Evolución de ventas (tabla pivot) | Mismos filtros de Ventas | No | Aplicar filtros | `SalesEvolutionTable` pivota solo el período principal. |
| Ventas | Modal de detalle diario | Hereda producto, tienda y período principal | No | Aplicar filtros indirecto | Solo debe refrescarse después de aplicar filtros y abrirse bajo el estado efectivo. |
| Stock | Stock por producto/tienda | Producto y tienda | No; sin fechas | Excluido | Inventario actual; no debe recibir comparación temporal. |
| Catálogo | Catálogo de productos | Producto/búsqueda | No; sin fechas | Excluido | No tiene dimensión temporal. |
| Entregas de mercadería | Recepciones | La UI no expone fecha; el endpoint admite fechas | No | Pendiente | Si no recibe parámetros, el servidor usa últimos 90 días hasta hoy. Decidir si debe permanecer independiente o adoptar el período aplicado. |

### 3.2 Portal Marca Propia — `/marca-propia`

**Archivo principal:** `client/src/pages/OwnBrandPortal.tsx`  
**Período predeterminado actual:** desde el primer día del mes actual hasta ayer, con la misma lógica de Proveedores.

| Área / pestaña | Elemento | Filtros actuales | Compara períodos hoy | Clasificación | Observación de impacto |
|---|---|---|---|---|---|
| Dashboard | KPIs: ventas, tickets, unidades, artículos vendidos, tiendas activas | Fecha, categoría interna e IGV | No | Aplicar filtros | `getSalesSummary` recibe un solo período. |
| Dashboard | Tendencia de ventas diarias | Fecha, categoría interna e IGV | No | Aplicar filtros | Una serie temporal con `getDailySales`. |
| Dashboard | Ventas por mes — últimos 6 meses | Ninguno de los controles de fecha visibles | No | Pendiente | `getMonthlySales` está fijado a los últimos 6 meses y no recibe categoría ni IGV. |
| Dashboard | Análisis por canal | Fecha, categoría interna e IGV | No | Aplicar filtros | Un único período principal con `ChannelBreakdown`. |
| Dashboard | Ventas y resumen por categoría interna | Fecha e IGV | No | Aplicar filtros | `getSalesByCategory` usa fecha e IGV. Actualmente no recibe `selectedCategoryId`; se registra como comportamiento existente fuera de alcance. |
| Dashboard | Top 10 artículos | Fecha, categoría interna e IGV | No | Aplicar filtros | `getTopProducts` recibe un período. |
| Dashboard | Ventas por tienda | Fecha, categoría interna e IGV | No | Aplicar filtros | `getSalesByBranch` recibe un período. |
| Ventas | Ventas por artículo y tienda | Fecha, categoría, artículo, tienda, canal, IGV y dimensiones visibles | No | Aplicar filtros | Tabla, exportación y consultas se recalculan inmediatamente. |
| Ventas | Evolución de ventas (tabla pivot) | Mismos filtros de Ventas | No | Aplicar filtros | Un único período principal con granularidad día/semana/mes. |
| Ventas | Modal de detalle diario | Hereda artículo, tienda y período principal | No | Aplicar filtros indirecto | Debe leer únicamente el estado aplicado. |
| Stock | Stock por artículo/tienda/categoría | Artículo, tienda y categoría | No; sin fechas | Excluido | Inventario actual. |
| Catálogo | Catálogo por categoría | Búsqueda y categoría | No; sin fechas | Excluido | No tiene dimensión temporal. |
| Entregas de mercadería | Recepciones | Sin fecha expuesta en UI; endpoint admite fechas | No | Pendiente | Si no recibe fechas, servidor usa últimos 90 días hasta hoy. |
| Marcas y categorías | Administración de configuración | Sin filtros temporales | No | Excluido | Módulos administrativos; no deben verse afectados. |

---

## 4. Comparaciones temporales existentes fuera de los portales

Estas referencias se revisaron para verificar si los portales ya reutilizan comparativos. **No los consumen**, por lo que no se propone cambiarlos dentro de este trabajo.

| Área fuera de alcance | Comparación existente | Estado frente a este encargo |
|---|---|---|
| `SalesByShelf` / `/sales-by-shelf` | `getSalesByShelfComparison`, KPIs, tooltips y tabla vs período anterior | Fuera del alcance de ambos portales. Sirve como referencia de cálculo y UX. |
| `HourlyAnalysis` / `/hourly` | KPIs con `getHourlyComparison` | Fuera del alcance. |
| Mapa de calor de `/hourly` | Comparación particular contra últimas seis semanas | **Expresamente excluido.** No se modifica. |
| `BranchBarChart`, `CategoryPieChart`, `KPICard`, `SalesLineChart` | Admiten o presentan variaciones opcionales | No están montados en los dos portales analizados. No se conectarán sin aprobación. |

La utilidad compartida `inclusiveCalendarDays` ya implementa el conteo inclusivo de días calendario. La modalidad “período inmediatamente anterior” debe reutilizar esa semántica si en el futuro se aprueba un comparativo de portal.

---

## 5. Filtros, contextos, navegación y URL actuales

### Estado de filtros

| Elemento | Proveedores | Marca Propia | Estado actual |
|---|---|---|---|
| Fecha principal | Estado local `from` / `to` | Estado local `from` / `to` | Aplica de forma inmediata, sin URL. |
| IGV | `IgvContext` global | `IgvContext` global | Persistencia en `sessionStorage`; no queda en URL. |
| Proveedor | `selectedSupplierId` local para roles comerciales/sistema | No aplica | Selección previa al acceso al portal. |
| Categoría interna | No aplica | `selectedCategoryId` local y compartido entre varias pestañas | Se aplica inmediatamente. |
| Artículo/producto | Local a la pestaña Ventas | Local a la pestaña Ventas | Se aplica inmediatamente. |
| Tienda | Local a Ventas, Stock u otros módulos | Local a Ventas, Stock u otros módulos | Se aplica inmediatamente. |
| Canal | Local a Ventas | Local a Ventas | Se aplica inmediatamente. |
| Toggles de dimensión, orden, paginación y granularidad | Locales | Locales | Son preferencias de presentación, no filtros de datos globales. |

### Contextos compartidos

- `FiltersContext` existe a nivel de aplicación, pero **ninguno de los dos portales lo consume**.
- `IgvContext` sí se consume en ambos portales. Es una preferencia global de sesión, almacenada en `sessionStorage`.
- Los portales no comparten contexto entre sí, ni heredan filtros desde las páginas generales analíticas.

### URL, rutas y navegación

- Las rutas son `/supplier` y `/marca-propia`.
- Los dos portales utilizan estados locales y **no leen ni escriben parámetros de búsqueda**.
- `App.tsx` no provee serialización de filtros para estos portales.
- La pestaña activa (`dashboard`, `ventas`, etc.) tampoco está en la URL.
- Por lo tanto, hoy no hay enlaces compartibles, recarga reproducible ni historial Atrás/Adelante para filtros de estos portales.

---

## 6. Consultas y servicios afectados potencialmente

### Portal de Proveedores

| Endpoint | Usa período principal hoy | Impacto estimado |
|---|---:|---|
| `getSalesSummary` | Sí | Estado efectivo / URL. |
| `getSalesByChannel` | Sí | Estado efectivo / URL. Sin segundo período salvo nueva aprobación. |
| `getDailySales` | Sí | Estado efectivo / URL. |
| `getTopProducts` | Sí | Estado efectivo / URL. |
| `getSalesByBranch` | Sí | Estado efectivo / URL. |
| `getSalesByProductBranch` | Sí | Estado efectivo / URL. |
| `exportSalesByProductBranch` | Sí | Debe usar exactamente los filtros aplicados. |
| `getSalesLineChart` | Sí | Estado efectivo / URL. |
| `getSalesEvolution` | Sí | Estado efectivo / URL. |
| `getSalesDailyDetail` | Sí | Debe heredar el período efectivo. |
| `getMonthlySales` | No, usa últimos 6 meses fijos | Pendiente de decisión. |
| `getReceptions` | No desde UI; defecto de 90 días | Pendiente de decisión. |

### Portal Marca Propia

| Endpoint | Usa período principal hoy | Impacto estimado |
|---|---:|---|
| `getSalesSummary` | Sí | Estado efectivo / URL. |
| `getSalesByChannel` | Sí | Estado efectivo / URL. Sin segundo período salvo nueva aprobación. |
| `getDailySales` | Sí | Estado efectivo / URL. |
| `getTopProducts` | Sí | Estado efectivo / URL. |
| `getSalesByBranch` | Sí | Estado efectivo / URL. |
| `getSalesByCategory` | Sí | Estado efectivo / URL. Mantener su filtro actual, sin corregir comportamiento ajeno. |
| `getSalesByProductBranch` | Sí | Estado efectivo / URL. |
| `exportSalesByProductBranch` | Sí | Debe usar exactamente los filtros aplicados. |
| `getSalesEvolution` | Sí | Estado efectivo / URL. |
| `getSalesDailyDetail` | Sí | Debe heredar el período efectivo. |
| `getMonthlySales` | No, usa últimos 6 meses fijos | Pendiente de decisión. |
| `getReceptions` | No desde UI; defecto de 90 días | Pendiente de decisión. |

No se requieren cambios de esquema ni migraciones para el estado aplicado, la URL o los rangos comparativos. Las consultas PostgreSQL ya reciben fechas como parámetros; si se aprueba comparación, se reutilizarían los mismos filtros con un segundo rango, sin duplicar lógica de seguridad.

---

## 7. Riesgos e impacto técnico

| Área | Impacto / riesgo | Mitigación propuesta |
|---|---|---|
| Contradicción de alcance | No existen comparativos en los portales, pero se solicita comparación disponible en ambos. | Resolver explícitamente si se mantiene la exclusión estricta o se autoriza crear comparativos nuevos. |
| Estado y URL | Ningún portal tiene serialización de filtros hoy. | Implementar lectura/escritura local por ruta, con validación de parámetros y fallback visible ante comparativo inválido. |
| Reconsultas | Hoy cada cambio de fecha/filtro vuelve a consultar inmediatamente; varias consultas de Dashboard se habilitan incluso fuera de la pestaña Dashboard. | Separar estado temporal de estado aplicado; consultar solo desde valores aplicados. Esto reduce solicitudes intermedias. |
| Rendimiento/caché | Cada rango aplicado produce una clave distinta en caché. La caché ya tiene máximo de 500 entradas, TTL dinámico de 60 s y protección contra consultas simultáneas. | Conservar claves por filtros efectivos; no emitir consultas por cambios pendientes. |
| Consistencia filtros | El Dashboard y Ventas tienen controles diferentes; Marca Propia añade categoría compartida. | Definir una lista explícita de filtros serializables y cuáles pertenecen a cada pestaña. |
| Seguridad del proveedor | Un identificador de proveedor en URL no debe ampliar acceso. | Mantener `getSupplierIdFromCtx`: el backend ya valida proveedor asignado y roles con override. |
| Recepciones y tendencia mensual | Tienen rangos propios en servidor, independientes de los filtros visibles. | No cambiar sin decisión explícita; cambiarlo altera comportamiento existente. |
| Navegación | El requerimiento propone herencia y diálogo entre páginas con períodos distintos, pero los portales no pertenecen al contexto global actual. | Tratar la herencia entre portales y páginas generales como una fase separada, sujeta a aprobación. |
| Errores/carga | React Query puede reemplazar datos al modificar inputs. | Mantener la vista aplicada hasta que la siguiente respuesta esté disponible y exponer carga a nivel de componente. Requiere validar el patrón exacto de la versión actual de React Query antes de implementarlo. |

---

## 8. Diseño de solución de menor impacto (propuesto, no implementado)

### Alternativa recomendada: estado aplicado por portal, sin nuevo contexto global

1. **Estado temporal local** para los controles editables de la ruta actual.
2. **Estado efectivo derivado de la URL** como única fuente de consultas.
3. Botón **Aplicar filtros** que serializa solo los filtros aprobados de esa ruta.
4. Botón **Restablecer filtros** que escribe los predeterminados del portal: mes actual hasta ayer, IGV por defecto y filtros limpios.
5. Las consultas reciben exclusivamente el estado efectivo; cambiar un control pendiente no dispara queries.
6. Si se aprueba una comparación futura, añadir `comparisonMode`, `comparisonStart` y `comparisonEnd` únicamente a los componentes que realmente ya comparen o que se autoricen a convertir en comparativos.

**Ventaja:** respeta la autonomía de las rutas `/supplier` y `/marca-propia`, evita alterar `FiltersContext`, no cambia rutas ni contratos existentes de datos y limita el riesgo de regresión.

### Alternativa de alto impacto — no recomendada sin aprobación

Crear un contexto temporal global para todas las páginas analíticas, sincronizarlo con cada ruta y añadir diálogo de herencia entre páginas de naturaleza distinta.

**Impacto:** modifica arquitectura compartida, navegación, URL, múltiples páginas fuera de los portales y reglas de herencia. No se recomienda como primer paso porque excede el alcance delimitado y contradice la indicación de no refactorizar por conveniencia.

---

## 9. Esquema conceptual de parámetros URL (propuesta sujeta a aprobación)

Los nombres definitivos se deben ajustar a las convenciones que se aprueben; hoy no existe una convención de filtros URL en estos portales.

| Parámetro propuesto | Ejemplo | Aplica a | Nota |
|---|---|---|---|
| `from` | `2026-09-01` | Ambos | Inicio del período principal. |
| `to` | `2026-09-29` | Ambos | Fin del período principal. |
| `igv` | `1` / `0` | Ambos | Estado efectivo de IGV. |
| `supplierId` | UUID | Proveedores, roles autorizados | El backend conserva la autorización. |
| `categoryId` | entero | Marca Propia | Solo si se aprueba serializar el filtro compartido. |
| `productIds` | lista codificada | Pestaña Ventas | Solo si se confirma que filtros por pestaña deben formar parte del enlace. |
| `branchId` | UUID | Ventas / Stock | Igual criterio que producto. |
| `channels` | `Presencial,eCommerce` | Ventas | Igual criterio que producto. |
| `comparisonMode` | `previous` / `days` / `months` | Solo si se aprueba comparación | No se agregarían parámetros de comparación si se mantiene la exclusión estricta. |

Los parámetros inválidos deben validarse antes de pasar a las consultas. Para un período comparativo personalizado inválido, se conserva el período principal válido y se muestra el estado que solicite seleccionar nuevamente el comparativo, sin reemplazarlo silenciosamente.

---

## 10. Plan incremental condicionado a confirmación

### Fase 1 — Decisiones funcionales

Confirmar los cuatro puntos de la sección siguiente. No modificar código antes de cerrarlos.

### Fase 2 — Aplicar filtros sin comparación nueva

1. Implementar estado temporal y efectivo en **Portal de Proveedores**.
2. Serializar filtros aprobados en `/supplier`.
3. Conectar consultas del Dashboard y Ventas al estado efectivo.
4. Mantener elementos sin período principal fuera del cambio hasta resolverlos.
5. Probar recarga, URL compartida, Atrás/Adelante, restablecimiento y no-consulta antes de Aplicar.
6. Repetir el mismo patrón en **Portal Marca Propia**, manteniendo su categoría interna y controles propios.

### Fase 3 — Comparación personalizada (solo si se autoriza)

1. Añadir cálculo puro y validado de los tres modos: período anterior, rango de días y meses completos.
2. Persistir modalidad y períodos en URL.
3. Ajustar únicamente los componentes comparativos aprobados.
4. Duplicar consultas por período solo para dichos componentes; los no comparativos seguirán consumiendo solo el principal.
5. Aplicar matriz de pruebas indicada en el requerimiento.

### Fase 4 — Validación final

- Matriz de rutas, componentes y filtros modificados.
- Pruebas de URL, recarga, historial, filtros pendientes, permisos, navegación, responsive y errores parciales.
- Evidencia de que Stock/Catálogo/administración y el mapa de calor no fueron modificados.

---

## 11. Decisiones necesarias para continuar

1. **Comparación en los portales:**
   - **Opción A (recomendada):** no crear comparativos nuevos, porque no existen actualmente; implementar solo “Aplicar filtros + URL” para los componentes que consumen un único período.
   - **Opción B:** autorizar crear comparativos nuevos en componentes concretos de ambos Dashboards. En ese caso, indicar cuáles: KPIs, tendencia diaria, canal, top productos, ventas por tienda, tabla de ventas y/o evolución.

2. **Elementos con período propio:** ¿`Ventas por mes (últimos 6 meses)` y `Entregas de mercadería` deben conservar sus ventanas independientes actuales, o deben obedecer el período aplicado global del portal?

3. **Alcance de URL y Aplicar filtros:** ¿deben incluirse también los filtros específicos de pestaña (producto, tienda, canal y categoría), o solo los compartidos del portal (período, IGV, proveedor y categoría compartida)?

4. **Herencia entre rutas:** el requisito describe un diálogo de herencia entre páginas con períodos diferentes. ¿Se autoriza extenderlo a estas dos rutas, aunque hoy no participan en el contexto global de filtros, o se limita esta primera fase a enlaces/reloads dentro de cada portal?

Una respuesta a estas decisiones permite pasar al **Punto de control 2: diseño de solución detallado** sin introducir supuestos funcionales.
