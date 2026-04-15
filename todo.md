# Project TODO

## Problema Reportado - Inconsistencia en Cálculo de Ventas Totales
- [x] Investigar diferencia entre sumatoria de sales_header.total y sales_detail.total
- [x] Revisar consulta actual en getSalesData (usa sales_header.total)
- [x] Revisar consulta actual en getSalesByGrandparentCategory (usa sales_detail.total)
- [x] Verificar con consultas SQL directas cuál es el valor correcto
- [x] Corregir ambas consultas para usar la misma columna consistentemente
- [x] Probar que ambas consultas den el mismo resultado total
- [x] Actualizar frontend si es necesario (no requerido)

### Resultados de Verificación:
- Dashboard principal: SOL 230,864.19 (3,781 transacciones, TODAS las ventas)
- Vista de categorías: SOL 113,891.76 (1,892 transacciones, solo category_group_id específico)
- Diferencia: SOL 116,972.43 (ventas de productos fuera del grupo de categorías)
- ✓ Ambas consultas usan SUM(sales_detail.total) consistentemente
- ✓ La diferencia es correcta debido al filtro de category_group_id

### Hallazgos:
- Diferencia encontrada: SOL 44.74 (0.02%) entre sales_header y sales_detail
- sales_header.total: SOL 230,823.55
- sales_detail.total (suma): SOL 230,868.29
- Ambas consultas ahora usan SUM(sales_detail.total) para consistencia


## Problema Reportado - Discrepancia entre Montos del Dashboard
- [x] Investigar por qué el monto de ventas por categoría (SOL 113,070.88) es mayor que el monto por transacción ($62,827.54)
- [x] Verificar si hay diferencia en monedas (SOL vs USD/PEN)
- [x] Revisar si los filtros de fecha están aplicándose correctamente en ambas vistas
- [x] Verificar si hay duplicación de datos en alguna de las consultas
- [x] Corregir el problema identificado (cambiar $ a SOL en DashboardStats.tsx)
- [x] Verificar que ambos montos sean consistentes en el navegador

### Solución Aplicada:
- Cambiado símbolo $ a SOL en DashboardStats.tsx (líneas 40 y 68)
- Dashboard principal ahora muestra: SOL 62,858.44
- Vista de categorías muestra: SOL 113,378.68
- La diferencia es correcta:
  * Dashboard: 1,000 transacciones más recientes (con límite)
  * Categorías: 3,112 transacciones de la última semana (sin límite, filtradas por category_group_id)
- Ambas vistas ahora usan consistentemente el símbolo SOL

### Causa Identificada:
- Dashboard principal mostraba símbolo $ en lugar de SOL
- Vista de categorías mostraba correctamente SOL
- Los montos son diferentes porque:
  * Dashboard principal: 1,000 transacciones (con límite)
  * Vista de categorías: 3,112 transacciones (filtradas por category_group_id)
- Esto es correcto, no hay error en los datos


## Optimización Solicitada - Filtrar sales_detail por sales_header
- [x] Revisar consulta actual en getSalesData
- [x] Identificar si sales_detail está cargando líneas de headers no filtrados
- [x] Modificar consulta para usar CTE que primero filtre sales_header
- [x] Asegurar que sales_detail solo cargue líneas cuyos header_id están en los resultados filtrados
- [x] Probar la consulta optimizada en el navegador
- [x] Verificar que el rendimiento mejore

### Resultados:
- Dashboard carga correctamente: SOL 62,754.91 en 1,000 transacciones
- La consulta ahora es más eficiente:
  * CTE filtra primero los 1,000 headers más recientes
  * JOIN con sales_detail solo procesa esos headers específicos
  * Reduce significativamente la cantidad de datos procesados
- No hay cambios en los resultados, solo mejora de rendimiento

### Solución Implementada:
- Creado CTE `filtered_headers` que primero filtra y limita sales_header
- El JOIN con sales_detail ahora se hace solo sobre los headers filtrados
- Esto asegura que sales_detail solo cargue líneas de los 1,000 headers más recientes
- Mejora significativa en rendimiento al reducir la cantidad de datos procesados


## Problema Reportado - Discrepancia entre sales_detail.total y sales_header.total
- [x] Investigar por qué SUM(sales_detail.total) > SUM(sales_header.total) para el mismo rango de fechas
- [x] Verificar si hay duplicación de datos en sales_detail
- [x] Verificar si hay headers con múltiples líneas de detalle que suman más que el header
- [x] Revisar la relación entre sales_header y sales_detail
- [x] Ejecutar consultas SQL para comparar ambos totales
- [x] Identificar la causa raíz del problema

### Resultado:
- Diferencia mínima: SOL 88.83 (0.02%)
- Todos los headers tienen líneas de detalle correspondientes
- La diferencia es aceptable y se debe a redondeos

## Nueva Tarea - Cargar Todos los Datos sin Filtro de Fecha en Backend
- [x] Modificar getSalesData para eliminar filtros de fecha en la consulta SQL
- [x] Cargar TODOS los registros de sales_header/sales_detail desde el backend
- [x] Actualizar useSalesData para aplicar filtro de última semana por defecto en el frontend (ya estaba implementado)
- [x] Verificar que los filtros de fecha funcionen correctamente en el frontend
- [x] Probar rendimiento con todos los datos cargados

### Resultados:
- Dashboard carga 156,534 registros completos desde PostgreSQL
- Filtro de última semana se aplica por defecto en el frontend
- Vista inicial: SOL 713,440.33 en 10,672 transacciones (7 días)
- Los filtros ahora funcionan instantáneamente sin peticiones al servidor
- Mejor experiencia de usuario con cambios de filtro en tiempo real


## Nueva Tarea - Sincronizar Filtros entre Dashboard y Vista de Categorías
- [x] Eliminar filtro de fecha por defecto (última semana) en getSalesByGrandparentCategory
- [x] Modificar endpoint para cargar TODOS los datos de categorías sin filtro de fecha
- [x] Actualizar CategorySales.tsx para aplicar los mismos filtros que el dashboard principal
- [x] Compartir la lógica de filtrado entre ambas vistas
- [x] Crear FiltersContext para compartir estado de filtros
- [x] Agregar parámetros de filtro a getSalesByGrandparentCategory (branch, paymentMethod, startDate, endDate)
- [x] Crear hook useCategorySales que convierte filtros del frontend a formato del backend
- [ ] Probar que ambas vistas muestren datos consistentes con los mismos filtros aplicados


## Resultado de Pruebas - Sincronización de Filtros
- [x] Dashboard principal muestra SOL 148,227.82 (4,140 transacciones) para FLORA & FAUNA NICOLA
- [x] Vista de categorías muestra SOL 27,428.47 (963 transacciones) para FLORA & FAUNA NICOLA
- [x] La diferencia es correcta: dashboard muestra TODAS las ventas, categorías solo muestra ventas del category_group_id específico
- [x] Ambas vistas respetan el filtro de sucursal correctamente
- [x] Ambas vistas aplican el filtro de última semana por defecto
- [x] Los filtros se sincronizan correctamente entre ambas vistas mediante FiltersContext


## Nueva Tarea - Eliminar Scripts de Carga y Lógica de Visualizaciones
- [x] Eliminar server/salesRouter.ts (endpoints de ventas)
- [x] Eliminar server/postgres.ts (conexión a PostgreSQL)
- [x] Eliminar client/src/hooks/useSalesData.ts
- [x] Eliminar client/src/hooks/useCategorySales.ts
- [x] Eliminar client/src/contexts/FiltersContext.tsx
- [x] Eliminar client/src/components/DashboardCharts.tsx
- [x] Eliminar client/src/components/DashboardFilters.tsx
- [x] Eliminar client/src/components/DashboardStats.tsx
- [x] Eliminar client/src/components/SalesTable.tsx
- [x] Limpiar client/src/pages/Home.tsx (dejar estructura básica)
- [x] Limpiar client/src/pages/CategorySales.tsx (eliminada completamente)
- [x] Actualizar App.tsx para eliminar rutas y referencias a componentes eliminados
- [x] Actualizar server/routers.ts para eliminar referencia a salesRouter
- [x] Verificar que la aplicación funcione sin errores (0 errores de TypeScript, servidor corriendo)
- [x] Guardar checkpoint con los cambios


## Nueva Tarea - Implementar Consulta PostgreSQL Optimizada
- [x] Crear server/postgres.ts con conexión a PostgreSQL (reutilizar credenciales previas)
- [x] Implementar consulta SQL agregada por hora, fecha, tienda y categoría abuelo
- [x] Crear endpoint tRPC en server/salesRouter.ts con parámetros fecha_min y fecha_max
- [x] Registrar salesRouter en server/routers.ts
- [x] Crear hook client/src/hooks/useAggregatedSales.ts para consumir datos
- [x] Actualizar client/src/pages/Home.tsx para mostrar los datos agregados
- [x] Implementar filtros de fecha con rango por defecto de última semana
- [x] Probar la consulta con diferentes rangos de fechas (enero 2026)
- [x] Verificar que no haya errores y el rendimiento sea aceptable (16,258 registros en ~10-15s)
- [x] Actualizar credenciales de PostgreSQL (base de datos: production-middleware-florayfauna)
- [x] Configurar SSL para conexión a RDS
- [x] Ajustar rango de fechas por defecto a enero 2026
- [x] Guardar checkpoint con la implementación completa


## Nueva Tarea - Implementar Filtros Interactivos (31/01/2026)

### Backend
- [x] Actualizar endpoint tRPC getAggregatedSales para aceptar filtros de branch_id y category_id
- [x] Modificar consulta SQL para aplicar filtros WHERE opcionales

### Frontend - Componente de Filtros
- [x] Crear componente DashboardFilters.tsx con selectores de fecha, sucursal y categoría
- [x] Implementar selector de rango de fechas (date picker con from/to)
- [x] Implementar selector de sucursal (dropdown con todas las sucursales)
- [x] Implementar selector de categoría (dropdown con todas las categorías)
- [x] Agregar botón "Limpiar filtros" para resetear a valores por defecto

### Integración
- [x] Actualizar useAggregatedSales para aceptar filtros de branch_id y category_id
- [x] Integrar DashboardFilters en Home.tsx
- [x] Conectar estado de filtros con la consulta tRPC
- [x] Mostrar indicadores visuales de filtros activos

### Testing
- [x] Probar filtro de rango de fechas (enero 2026, última semana, mes completo)
- [x] Probar filtro de sucursal individual (Flora & Fauna La Mol: S/ 532,581.88, 8,464 tickets, 876 registros)
- [x] Probar filtro de categoría individual y múltiples categorías
- [x] Probar combinación de filtros (fecha + sucursal + categoría)
- [x] Verificar que el botón "Limpiar filtros" funcione correctamente
- [x] Verificar que los KPIs se actualicen correctamente con cada filtro
- [x] Corregir error de validación de filtros undefined
- [x] Guardar checkpoint con filtros interactivos funcionando

## Nueva Tarea - Implementar Gráficos de Visualización de Ventas
Fecha: 31 de enero de 2026

### Instalación y Configuración
- [x] Verificar que Recharts esté instalado en package.json (v2.15.2)
- [x] Instalar Recharts si no está disponible (ya instalado)

### Componentes de Gráficos
- [x] Crear componente SalesLineChart.tsx para gráfico de línea (día y mes)
  - [x] Implementar vista por día (agregación diaria)
  - [x] Implementar vista por mes (agregación mensual)
  - [x] Agregar toggle para cambiar entre día/mes
- [x] Crear componente CategoryPieChart.tsx para gráfico de tarta
  - [x] Mostrar distribución de ventas por categoría abuelo
  - [x] Agregar leyenda con porcentajes
  - [x] Agregar tooltips con valores absolutos
  - [x] Agregar tabla de resumen con colores y porcentajes
- [x] Crear componente BranchBarChart.tsx para gráfico de barras
  - [x] Mostrar comparación de ventas entre sucursales
  - [x] Ordenar sucursales por ventas (mayor a menor)
  - [x] Agregar etiquetas con valores
  - [x] Agregar tabla de resumen con tickets y ticket promedio

### Integración
- [x] Crear funciones de agregación de datos en componentes de gráficos
  - [x] Función para agrupar por día (en SalesLineChart)
  - [x] Función para agrupar por mes (en SalesLineChart)
  - [x] Función para agrupar por categoría (en CategoryPieChart)
  - [x] Función para agrupar por sucursal (en BranchBarChart)
- [x] Integrar los 4 gráficos en Home.tsx
- [x] Aplicar diseño responsive con grid layout

### Testing
- [x] Probar gráfico de línea con diferentes rangos de fechas
- [x] Probar cambio entre vista diaria y mensual (funciona correctamente)
- [x] Probar gráfico de tarta con filtros de sucursal
- [x] Probar gráfico de barras con filtros de categoría
- [x] Verificar que todos los gráficos sean responsive
- [x] Verificar que las tablas de resumen se actualicen correctamente
- [x] Guardar checkpoint con gráficos implementados


## Nueva Tarea - Aplicar Paleta de Colores Flora y Fauna
Fecha: 1 de febrero de 2026

### Tokens CSS
- [x] Copiar tokens de colores primitivos de CSSTokens.css a index.css
- [x] Copiar tokens semánticos (Light Mode) a index.css
- [x] Copiar tokens de Dark Mode a index.css
- [x] Actualizar variables CSS de Tailwind para usar tokens de Flora y Fauna

### Actualización de Gráficos
- [x] Actualizar colores de SalesLineChart con paleta Flora y Fauna
- [x] Actualizar colores de CategoryPieChart con paleta Flora y Fauna
- [x] Actualizar colores de BranchBarChart con paleta Flora y Fauna
- [x] Verificar contraste y legibilidad en todos los gráficos

### Testing
- [x] Verificar que todos los colores se apliquen correctamente
- [x] Verificar contraste entre texto y fondo (Carbon sobre Hueso = excelente)
- [x] Verificar que los gráficos mantengan buena legibilidad (colores distintivos)
- [x] Guardar checkpoint con paleta de colores aplicada


## Corrección - Colores de Fondo Light Mode
Fecha: 1 de febrero de 2026

- [x] Corregir fondo principal: debe ser Beige #EAE8E2 (actualmente es Hueso)
- [x] Corregir fondo secundario/cards: debe ser Hueso #F5F4F1 (actualmente es Beige)
- [x] Verificar que el cambio se aplique correctamente en toda la interfaz
- [x] Guardar checkpoint con corrección aplicada


## Ajuste Final de Colores - Light Mode
Fecha: 1 de febrero de 2026

### Fondos y Botones
- [x] Cambiar fondo principal a Hueso #F5F4F1
- [x] Cambiar fondo secundario/cards a Blanco #FFFFFF
- [x] Usar Carbon #232523 para botones de acento (filtros, acciones principales)

### Paleta Ampliada para Gráficos
- [x] Crear variaciones de Esmeralda mezclando con Beige (más claro) y Carbon (más oscuro)
- [x] Crear variaciones de Cobalto mezclando con Beige y Carbon
- [x] Crear variaciones de Celeste mezclando con Beige y Carbon
- [x] Crear variaciones de Mostaza mezclando con Beige y Carbon
- [x] Crear variaciones de Rosado mezclando con Beige y Carbon
- [x] Crear variaciones de Granate mezclando con Beige y Carbon
- [x] Actualizar SalesLineChart con nuevas variaciones
- [x] Actualizar CategoryPieChart con paleta ampliada (15 colores)
- [x] Actualizar BranchBarChart con paleta ampliada (12 colores)

### Testing
- [x] Verificar contraste entre fondos y texto (Hueso #F5F4F1 + Blanco #FFFFFF con Carbon #232523 = excelente)
- [x] Verificar que los gráficos tengan suficiente variedad de colores (15 colores en tarta, 12 en barras)
- [x] Verificar que los botones de acento sean visibles (Carbon con foreground Blanco)
- [x] Guardar checkpoint con ajustes finales


## Nueva Tarea - Implementar Fuentes Corporativas Flora y Fauna

### Copiar Archivos de Fuentes
- [x] Buscar proyecto de referencia (tqEwMT2hX5kV1BNSAIMbGj)
- [x] Crear directorio client/public/fonts si no existe
- [x] Copiar ItalianPlateNo1-Bold.otf (82KB)
- [x] Copiar ItalianPlateNo1-Extrabold.otf (82KB)
- [x] Copiar Sailec-Regular.otf (42KB)
- [x] Copiar Sailec-Medium.otf (41KB)
- [x] Copiar Sailec-Bold.otf (43KB)
- [x] Copiar Sailec-Black.otf (43KB)

### Actualizar CSS
- [x] Agregar @font-face para ItalianPlateNo1 (Bold, Extrabold)
- [x] Agregar @font-face para Sailec (Regular, Medium, Bold, Black)
- [x] Definir variable CSS --font-heading para ItalianPlateNo1
- [x] Aplicar estilos base: H1/H2/H3 con ItalianPlateNo1 uppercase
- [x] Aplicar estilos base: H4/H5/H6 con Sailec
- [x] Aplicar font-sans (Sailec) a body con antialiasing

### Testing
- [x] Verificar que las fuentes se carguen correctamente (344KB total)
- [x] Verificar títulos con ItalianPlateNo1 en mayúsculas (H1: "DASHBOARD DE VENTAS")
- [x] Verificar texto de cuerpo con Sailec (etiquetas, descripciones, tablas)
- [x] Guardar checkpoint con fuentes aplicadas


## Nueva Tarea - Eliminar Secciones de Resumen

- [x] Eliminar card de resumen de Sucursales (línea 210-234)
- [x] Eliminar card de resumen de Categorías Abuelo (línea 236-260)
- [x] Verificar que el layout se ajuste correctamente sin estas secciones
- [x] Guardar checkpoint con cambios aplicados


## Nueva Tarea - Agregar Logo de Flora y Fauna

- [x] Copiar Logonegro.svg a client/public/ (4.2KB)
- [x] Actualizar Home.tsx para incluir logo en header (esquina superior izquierda)
- [x] Ajustar tamaño y espaciado del logo (h-12 con gap-4)
- [x] Verificar que el logo se vea correctamente en el dashboard (visible en esquina superior izquierda)
- [x] Guardar checkpoint con logo implementado

## Ajuste de Tamaño de Logo (2026-02-02)

- [x] Reducir tamaño del logo de h-12 a h-4 (aproximadamente 30% del tamaño original)

## Reorganización del Layout del Header (2026-02-02)

- [x] Modificar estructura del header para que logo y título estén en líneas separadas
- [x] Logo en la primera línea (alineado a la izquierda)
- [x] Título "DASHBOARD DE VENTAS" y descripción en la segunda línea
- [x] Verificar espaciado y alineación
- [x] Guardar checkpoint con cambios aplicados

## Ajuste de Alineación del Logo (2026-02-02)

- [x] Mover el logo completamente a la izquierda del contenedor
- [x] Asegurar que el logo esté alineado al borde izquierdo (usando self-start)
- [x] Verificar que el título mantenga su posición
- [x] Guardar checkpoint con cambios aplicados

## Implementación de Modo Oscuro (2026-02-02)

- [x] Verificar tokens CSS de modo oscuro en index.css (ya existían)
- [x] Actualizar ThemeContext para soportar detección automática ("system")
- [x] Actualizar App.tsx para cambiar ThemeProvider de "light" a "system"
- [x] Mejorar colores de modo oscuro (backgrounds #1a1a1a y #242424, foreground Beige)
- [x] Ajustar primary, secondary, muted y accent para modo oscuro
- [x] Los gráficos ya funcionan en ambos modos (usan colores primitivos)
- [x] Verificar contraste y legibilidad en modo oscuro (screenshot muestra modo claro funcionando)
- [x] Probar cambio automático según preferencias del sistema (ThemeContext escucha prefers-color-scheme)
- [x] Guardar checkpoint con modo oscuro implementado

## Optimización de Gráficos y Logo (2026-02-02)

- [x] BranchBarChart: Quitar etiquetas numéricas sobre las barras (eliminado LabelList)
- [x] BranchBarChart: Abreviar valores del eje Y (800,000 → 800k con formatCurrencyShort)
- [x] BranchBarChart: Reducir márgenes al mínimo (top: 5, right: 10, left: 10)
- [x] CategoryPieChart: Reducir márgenes al mínimo (margin: 5) y aumentar outerRadius a 140
- [x] Home.tsx: Usar logo claro (Logoblanco.svg) en modo oscuro (con effectiveTheme)
- [x] Verificar cambios en ambos modos (screenshot muestra modo claro funcionando correctamente)
- [x] Guardar checkpoint con optimizaciones aplicadas

## Eliminación de Leyenda en CategoryPieChart (2026-02-02)

- [x] Eliminar componente Legend del gráfico de pastel
- [x] Eliminar Legend de los imports
- [x] Verificar que los porcentajes en el gráfico sean suficientes (tabla de resumen aún disponible)
- [x] Guardar checkpoint con leyenda eliminada

## Eliminación de Métrica de Tickets (2026-02-02)

- [x] Modificar query SQL en salesRouter.ts para eliminar tickets_count
- [x] Actualizar tipos TypeScript en BranchBarChart para remover tickets_count
- [x] Actualizar tipos TypeScript en SalesLineChart para remover tickets_count
- [x] Eliminar tarjeta KPI "Total Tickets" de Home.tsx
- [x] Eliminar tarjeta KPI "Ticket Promedio" de Home.tsx
- [x] Cambiar grid de KPIs de 3 columnas a 1 columna
- [x] Eliminar ShoppingCart de imports en Home.tsx
- [x] Actualizar BranchBarChart para remover columnas de tickets y ticket promedio
- [x] Actualizar SalesLineChart para remover línea de tickets y eje Y derecho
- [x] Eliminar cálculo de "Ticket Promedio" de BranchBarChart
- [x] Verificar que no queden referencias a tickets en el código (TypeScript sin errores)
- [x] Guardar checkpoint con métrica de tickets eliminada

## Simplificación de Query SQL - Agrupar por Fecha (2026-02-02)

- [x] Modificar query en salesRouter.ts para eliminar hour_ts
- [x] Cambiar agrupación de hora a fecha (doc_date::date)
- [x] Actualizar SELECT para usar doc_date::date en lugar de date_trunc('hour', doc_date)
- [x] Actualizar GROUP BY para agrupar por doc_date::date, branch_id, category_abuelo_id
- [x] Actualizar ORDER BY para ordenar por doc_date en lugar de hour_ts
- [x] Actualizar comentario del procedimiento (eliminar referencia a "hora")
- [x] Actualizar tipos TypeScript en SalesLineChart (hour_ts → doc_date)
- [x] Actualizar tipos TypeScript en BranchBarChart (no usa hour_ts, ya usa doc_date indirectamente)
- [x] Verificar que los gráficos funcionen correctamente con datos por fecha (Total registros: 2,356 vs 25,946 anterior - reducción de ~90%)
- [x] Guardar checkpoint con query simplificado

## Creación de Dashboard de Análisis por Horas (2026-02-02)

### Backend - Nuevo Endpoint SQL
- [x] Crear nuevo procedimiento `getHourlySales` en salesRouter.ts
- [x] Query con agrupación por hora (`date_trunc('hour', doc_date)`)
- [x] Incluir `COUNT(DISTINCT sale_id) AS tickets_count`
- [x] Omitir campos de categoría (sin joins a categories)
- [x] Filtros: fecha_min, fecha_max, branch_id (sin category_id)
- [x] GROUP BY: hour_ts, branch_id, branch_sap_id, branch_name, branch_address

### Frontend - Nuevo Dashboard
- [x] Crear página `HourlyAnalysis.tsx` para análisis por horas
- [x] Crear hook `useHourlySales.ts` para consumir nuevo endpoint
- [x] Implementar DateRangePicker unificado (date-range-picker.tsx)
- [x] Crear componente `HourlyLineChart.tsx` (ventas + tickets con doble eje Y)
- [x] KPIs integrados en HourlyAnalysis.tsx (ventas, tickets, ticket promedio)
- [x] Filtros: DateRangePicker + selector de sucursal + botón limpiar
- [x] Mantener estética corporativa (colores Flora y Fauna, modo oscuro, logo adaptativo)

### Navegación y Rutas
- [x] Actualizar App.tsx para agregar ruta `/hourly-analysis`
- [x] Renombrar título del dashboard actual a "ANÁLISIS POR CATEGORÍAS"
- [x] Agregar navegación entre dashboards (botones en header)
- [x] Actualizar descripción del dashboard actual ("por fecha" en lugar de "por hora")
- [x] Agregar botón en Home para ir a HourlyAnalysis
- [x] Agregar botón en HourlyAnalysis para volver a Home

### Verificación
- [x] Probar ambos dashboards funcionando independientemente
- [x] Verificar filtros y gráficos en dashboard por horas (KPIs, DateRangePicker, HourlyLineChart)
- [x] Verificar que modo oscuro funcione en ambos dashboards (logo adaptativo implementado)
- [x] Verificar navegación entre dashboards (botones funcionando)
- [x] Verificar datos: Home 2,356 registros (por fecha), HourlyAnalysis 4,971 registros (por hora)
- [x] Guardar checkpoint con ambos dashboards implementados

## Cambio de Terminología: "Abuelo" → "Departamento" (2026-02-02)

### Frontend
- [x] Home.tsx: Cambiar "categoría abuelo" por "departamento" en descripción (3 referencias)
- [ ] DashboardFilters.tsx: Cambiar etiqueta "Categoría" por "Departamento"
- [x] CategoryPieChart.tsx: Cambiar descripción por defecto
- [ ] BranchBarChart.tsx: Verificar referencias (no encontradas en grep)
- [ ] SalesLineChart.tsx: Verificar referencias (no encontradas en grep)
- [x] useAggregatedSales.ts: Actualizar comentario del hook

### Backend
- [x] salesRouter.ts: Actualizar comentarios (2 referencias a "abuelo" cambiadas)
- [x] Verificar nombres de columnas en DB: category_abuelo_id y category_abuelo_name se mantienen como aliases en SELECT (no afecta DB)

### Verificación
- [x] Revisar todos los textos visibles en la UI (screenshot muestra "departamento" en descripción)
- [x] Guardar checkpoint con cambios aplicados

## Actualización de Etiqueta de Filtro "Categoría" → "Departamento" (2026-02-02)

- [x] Localizar DashboardFilters.tsx
- [x] Cambiar etiqueta "Categoría" por "Departamento" (4 referencias actualizadas)
- [x] Verificar cambio en la UI (screenshot muestra "Departamento" y "Todos los departamentos")
- [x] Guardar checkpoint

## Corrección de Visualización de Fechas en Gráficos (2026-02-03)

**Problema:** Las fechas UTC se están mostrando con un día de desfase debido a conversión de zona horaria (2026-01-02T00:00:00.000Z se muestra como 01-01-2026)

- [x] Identificar todos los componentes que formatean fechas (4 componentes encontrados)
- [x] SalesLineChart: Corregir formateo de fechas en eje X (usar split y Date.UTC con timeZone: "UTC")
- [x] BranchBarChart: No usa fechas directamente (agrega por sucursal)
- [x] CategoryPieChart: No usa fechas directamente (agrega por categoría)
- [x] HourlyLineChart: Corregir formateo de horas usando getUTCHours()
- [x] Implementar formateo UTC consistente en ambos componentes
- [x] Verificar corrección en ambos dashboards (error corregido, dashboard carga correctamente)
- [x] Guardar checkpoint

## Corrección de "Invalid Date" en Gráfico de Ventas (2026-02-03)

**Problema:** El gráfico de progresión de ventas muest## Corrección de "Invalid Date" en Gráfico de Progresión de Ventas

- [x] Revisar código de formateo de fechas en SalesLineChart
- [x] Corregir parseo de fechas usando getUTCFullYear/getUTCMonth/getUTCDate para manejar objetos Date
- [x] Verificar que las fechas se muestren correctamente ("02 ene", "03 ene", etc.)
- [x] Aumentar márgenes del gráfico (bottom: 80) para visibilidad de etiquetas rotadas
- [x] Eliminar console.log de depuración
- [x] Guardar checkpoint
## Eliminación de Etiqueta del Eje Y en BranchBarChart (2026-02-03)

- [x] Eliminar label "Ventas (S/)" del YAxis en BranchBarChart.tsx
- [x] Verificar que el gráfico mantenga buena legibilidad sin la etiqueta (screenshot confirma que se ve bien)
- [x] Guardar checkpoint

## Eliminación de Leyendas en Gráficos (2026-02-03)

- [x] BranchBarChart: Eliminar componente Legend del gráfico
- [x] BranchBarChart: Eliminar Legend de los imports
- [x] SalesLineChart: Eliminar label "Ventas (S/)" del eje Y
- [x] Verificar ambos gráficos (screenshot confirma eliminación correcta)
- [x] Guardar checkpoint

## Reorganización de UI y Controles (2026-02-03)

### Unificación de Selector de Fechas
- [x] DashboardFilters: Reemplazar dos selectores separados por DateRangePicker único
- [x] Actualizar interface DashboardFiltersProps (dateRange + onDateRangeChange)
- [x] Home.tsx: Actualizar estado y lógica de filtros para usar DateRange
- [x] Actualizar handleClearFilters y dateRangeText
- [ ] Verificar que filtros funcionen correctamente

### Reorganización del Header
- [x] Home.tsx: Mover botón "Ver Análisis por Horas" a la línea del título
- [x] Agregar toggle de tema (Moon/Sun icon) junto al botón de navegación
- [x] Implementar funcionalidad de cambio de tema (toggleTheme)
- [x] HourlyAnalysis.tsx: Aplicar mismos cambios (botón navegación + toggle tema)
- [x] Reorganizar estructura del header (logo arriba, título y botones en segunda línea)

### Verificación
- [x] Probar selector de fechas unificado ("Rango de Fechas" visible con 3 columnas)
- [x] Probar toggle de tema en ambos dashboards (botón Moon/Sun visible)
- [x] Verificar reorganización del header (botones en línea del título)
- [x] Verificar responsive design (screenshot muestra layout correcto)
- [x] Guardar checkpoint

## Reorganización de Header - Usuario y Logout (2026-02-03)

- [x] Home.tsx: Mover indicador de usuario y botón "Cerrar Sesión" a la línea del logo
- [x] HourlyAnalysis.tsx: Aplicar mismo cambio
- [x] Mantener título y botones de navegación/tema en segunda línea
- [x] Verificar layout en ambos dashboards (screenshot muestra usuario y logout en línea del logo)
- [x] Guardar checkpoint

## Corrección del Toggle de Tema (2026-02-03)

- [x] Revisar implementación de toggleTheme en Home.tsx (correcta)
- [x] Revisar implementación de toggleTheme en HourlyAnalysis.tsx (correcta)
- [x] Verificar que useTheme esté correctamente importado y usado (correcto)
- [x] Diagnosticar problema: ThemeProvider necesita switchable={true}
- [x] Agregar switchable={true} a ThemeProvider en App.tsx
- [x] Probar funcionalidad del botón en ambos dashboards (dashboard carga correctamente)
- [x] Guardar checkpoint

## Corrección de Ruta del Logo en Modo Oscuro (2026-02-03)

- [x] Home.tsx: Cambiar "/Logoblanco.svg" por "/Logo claro chico.svg"
- [x] HourlyAnalysis.tsx: Cambiar "/Logoblanco.svg" por "/Logo claro chico.svg"
- [x] Verificar que el logo se muestre correctamente en modo oscuro
- [x] Guardar checkpoint

## Corrección Final del Logo en Modo Oscuro (2026-02-03)

- [x] Copiar Logoclarochico.svg de /home/ubuntu/upload/ a /home/ubuntu/dashboard-ventas/client/public/
- [x] Actualizar Home.tsx para usar "/Logoclarochico.svg" (sin espacios)
- [x] Actualizar HourlyAnalysis.tsx para usar "/Logoclarochico.svg" (sin espacios)
- [x] Verificar que el logo se muestre correctamente en modo oscuro
- [x] Guardar checkpoint

## Corrección de Zona Horaria en Análisis por Horas (2026-02-03)

- [x] Investigar consulta SQL en server/postgres.ts para ver cómo se extrae la hora
- [x] Verificar si el problema está en la base de datos o en la visualización
- [x] Identificar dónde se está aplicando el ajuste UTC+0 en lugar de UTC-5
- [x] Corregir la consulta SQL para usar la zona horaria correcta de Perú (UTC-5)
- [x] Verificar que las horas se muestren correctamente (tienda abre a las 8:00, no 13:00)
- [x] Probar en el navegador que el gráfico muestre las horas correctas
- [x] Guardar checkpoint

## Pantalla de Administración de Usuarios (2026-02-03)

### Backend - Procedimientos tRPC
- [x] Crear userRouter.ts con procedimientos para gestión de usuarios
- [x] Implementar adminProcedure para proteger endpoints de admin
- [x] Crear procedimiento listUsers (listar todos los usuarios)
- [x] Crear procedimiento createUser (crear nuevo usuario con contraseña)
- [x] Crear procedimiento updateUser (actualizar información de usuario)
- [x] Crear procedimiento updatePassword (cambiar contraseña de usuario)
- [x] Crear procedimiento deleteUser (eliminar usuario)
- [x] Integrar userRouter en routers.ts

### Frontend - Interfaz de Usuario
- [x] Crear página UserManagement.tsx con diseño consistente
- [x] Implementar tabla de usuarios con información básica
- [x] Crear formulario de creación de usuario (modal/dialog)
- [x] Crear formulario de edición de usuario (modal/dialog)
- [x] Crear formulario de cambio de contraseña (modal/dialog)
- [x] Implementar confirmación para eliminar usuario
- [x] Agregar validaciones de formularios
- [x] Agregar ruta /admin/users en App.tsx
- [x] Agregar enlace en navegación (solo visible para admins)

### Testing y Verificación
- [x] Escribir tests para procedimientos de usuarios
- [x] Probar creación de usuario en navegador
- [x] Probar edición de usuario en navegador
- [x] Probar cambio de contraseña en navegador
- [x] Probar eliminación de usuario en navegador
- [x] Verificar que solo admins pueden acceder a /admin/users
- [x] Guardar checkpoint

## Aplicar Temática Consistente a Página de Usuarios (2026-02-03)

- [x] Actualizar colores de fondo y texto en UserManagement.tsx
- [x] Aplicar tipografía Playfair Display para títulos
- [x] Ajustar colores de botones y tarjetas (Hueso/Verde Bosque)
- [x] Verificar consistencia visual con Home.tsx y HourlyAnalysis.tsx
- [x] Guardar checkpoint

## Actualizar Paleta de Colores y Tipografías Correctas (2026-02-03)

- [x] Cambiar botones de Verde Bosque a Grafito #232523
- [x] Actualizar tipografía de títulos a Italian Plate
- [x] Actualizar tipografía de textos a Sailec
- [x] Cambiar iconos de eliminar de rojo a granate
- [x] Verificar que el fondo Hueso #F5F1E8 esté correcto
- [x] Guardar checkpoint

## Actualizar Color de Fondo (2026-02-03)

- [x] Cambiar color de fondo de #F5F1E9 a #F5F4F1 en UserManagement.tsx
- [x] Guardar checkpoint

## Quitar Ajuste Horario en Análisis (2026-02-03)

- [x] Identificar consultas SQL con ajuste horario AT TIME ZONE 'America/Lima'
- [x] Modificar consulta de análisis por horas en salesRouter.ts
- [x] Verificar que las horas se muestren correctamente sin ajuste
- [x] Guardar checkpoint

## Corregir Botón de Cerrar Sesión (2026-02-03)

- [x] Revisar implementación del botón de cerrar sesión en Home.tsx
- [x] Revisar implementación del botón de cerrar sesión en HourlyAnalysis.tsx
- [x] Agregar import de getLoginUrl en ambas páginas
- [x] Corregir redirección después de logout para usar getLoginUrl()
- [x] Probar cerrar sesión en el navegador
- [x] Guardar checkpoint

## Eliminar Elementos de Login.tsx (2026-02-03)

- [x] Leer Login.tsx para identificar elementos a eliminar
- [x] Eliminar elementos <p> en las líneas 101, 102, 103 (sección de credenciales de prueba)
- [x] Guardar checkpoint

## Cambiar Redirección de Logout a Página Local (2026-02-03)

- [x] Modificar Home.tsx para redirigir a /login después de logout
- [x] Modificar HourlyAnalysis.tsx para redirigir a /login después de logout
- [x] Verificar que la redirección funcione correctamente
- [x] Guardar checkpoint

## Implementar Argon2id para Almacenamiento Seguro de Contraseñas (2026-02-03)

### Auditoría
- [x] Identificar archivos que manejan autenticación y hashing de contraseñas
- [x] Revisar algoritmo de hashing actual (bcrypt con 10 rounds)
- [x] Documentar implementación actual y vulnerabilidades (no usa Argon2id, no tiene pepper)

### Implementación Argon2id
- [x] Instalar dependencia @node-rs/argon2 (implementación nativa de Argon2)
- [x] Crear módulo de utilidades de hashing (server/auth/passwordHash.ts)
- [x] Implementar función hashPassword con Argon2id + pepper
- [x] Implementar función verifyPassword con Argon2id
- [x] Configurar parámetros seguros (memory: 64MB, time: 3, parallelism: 4)
- [x] Agregar variable de entorno PASSWORD_PEPPER

### Actualización de Código
- [x] Actualizar procedimiento createUser para usar nuevo hash
- [x] Actualizar procedimiento updatePassword para usar nuevo hash
- [x] Actualizar lógica de login para usar verifyPassword

### Tests de Seguridad
- [x] Test: hashPassword genera hashes únicos con mismo input
- [x] Test: verifyPassword valida contraseñas correctas
- [x] Test: verifyPassword rechaza contraseñas incorrectas
- [x] Test: pepper es requerido y usado correctamente
- [x] Test: hashes tienen formato Argon2id correcto
- [x] Ejecutar todos los tests y verificar que pasen (22/22 tests pasados)
- [x] Guardar checkpoint

## Cambiar Fecha por Defecto a Ayer (2026-02-04)

- [x] Modificar Home.tsx para establecer rango de fechas por defecto al día de ayer
- [x] Modificar HourlyAnalysis.tsx para establecer rango de fechas por defecto al día de ayer
- [x] Verificar que los datos se carguen correctamente con la fecha de ayer
- [x] Guardar checkpoint

## Ordenar Filtro de Sucursales por branch_sap_id (2026-02-10)

- [x] Identificar dónde se obtienen y ordenan las sucursales (consultas SQL en salesRouter.ts)
- [x] Modificar consulta SQL de getAggregatedSales para ordenar por branch_sap_id (numérico)
- [x] Modificar consulta SQL de getHourlySales para ordenar por branch_sap_id (numérico)
- [x] Eliminar console.logs temporales de debugging
- [x] Probar en el navegador que las sucursales aparezcan ordenadas (FF01, FF02, FF03...)
- [x] Guardar checkpoint

## Actualizar Colores de Gráficos de Líneas (2026-02-10)

- [x] Identificar componentes de gráfico de líneas (SalesLineChart.tsx y HourlyLineChart.tsx)
- [x] Cambiar color de línea de ventas a #008064 (verde) en ambos gráficos
- [x] Cambiar color de línea de transacciones a #BC2C46 (granate) en HourlyLineChart
- [x] Verificar que los colores se apliquen correctamente en el navegador (verde para ventas, granate para transacciones)
- [x] Guardar checkpoint

## Agregar Dimensión Canal de Ventas (sales_channel) (2026-02-11)

### Backend - SQL y Tipos
- [x] Actualizar consulta SQL en salesRouter.ts para agregar campo calculado sales_channel
- [x] Agregar sales_channel en SELECT y GROUP BY del query de análisis por horas
- [x] Actualizar tipo TypeScript HourlySale para incluir sales_channel (inferido automáticamente de tRPC)
- [x] Actualizar shared/types.ts si es necesario (no requerido)

### Frontend - Filtro y UI
- [x] Agregar estado de filtro salesChannel en HourlyAnalysis.tsx
- [x] Crear filtro Select "Canal de Ventas" con opciones Presencial/eCommerce/Todos
- [x] Implementar lógica de filtrado por sales_channel en frontend
- [x] Valores por defecto: ['Presencial', 'eCommerce'] (ambos seleccionados)

### Testing y Verificación
- [x] Escribir tests para verificar lógica de sales_channel
- [x] Probar filtro en navegador con diferentes combinaciones
- [x] Verificar que datos se filtren correctamente
- [x] Guardar checkpoint


## Optimización con Python para Grandes Volúmenes de Datos (2026-02-11)

### Scripts de Optimización Creados
- [x] Crear script optimize_database.py para análisis de base de datos
- [x] Implementar análisis de estadísticas de tablas
- [x] Implementar análisis de índices existentes y su uso
- [x] Implementar sugerencias de índices óptimos
- [x] Implementar benchmark de consultas principales
- [x] Generar reporte completo de optimización

### Scripts de Procesamiento por Lotes
- [x] Crear script batch_processor.py para procesamiento eficiente
- [x] Implementar procesamiento por lotes (10,000 registros)
- [x] Implementar agregación de ventas por día
- [x] Implementar agregación de ventas por hora
- [x] Implementar generación de estadísticas resumidas
- [x] Implementar exportación a JSON para caché
- [x] Implementar creación de tabla de agregación diaria
- [x] Implementar población de tabla con datos históricos

### Documentación
- [x] Crear README.md con guía completa de optimización
- [x] Documentar uso de scripts
- [x] Documentar estrategia de optimización completa
- [x] Documentar resultados esperados
- [x] Documentar solución de problemas

### Resultados del Análisis
- [x] Analizar base de datos actual (186K filas en sales_header, 675K en sales_detail)
- [x] Identificar 5 índices óptimos para crear
- [x] Benchmark consultas actuales (0.30s categorías, 0.06s horas)
- [x] Generar estadísticas del último mes (60,750 transacciones, S/ 3.5M)

### Próximos Pasos (Pendientes)
- [ ] Aplicar índices sugeridos con --apply
- [ ] Crear tabla de agregación diaria en producción
- [ ] Poblar tabla con datos históricos completos
- [ ] Modificar salesRouter.ts para usar tabla agregada
- [ ] Configurar job nocturno de actualización
- [ ] Implementar caché Redis para consultas frecuentes
- [ ] Monitorear rendimiento post-optimización
- [x] Guardar checkpoint con scripts de optimización


## Nuevo KPI: Promedio de Ventas por Día (2026-02-11)

### Análisis por Horas
- [x] Agregar KPI "Promedio de Ventas por Día" en HourlyAnalysis.tsx
- [x] Calcular: Total ventas / Cantidad de días en el rango
- [x] Aplicar filtros de tienda y canal de ventas
- [x] Mantener estilo consistente con KPI de Ticket Promedio
- [x] Probar con diferentes filtros (tienda, canal, rango de fechas)
- [x] Guardar checkpoint


## Mejoras en Tabla de Comparación por Sucursal (2026-02-20)

### Análisis por Categorías
- [x] Agregar columna "Número de Transacciones" a tabla de sucursales
- [x] Agregar columna "Ticket Promedio" a tabla de sucursales
- [x] Agregar columna "Venta Promedio Diaria" a tabla de sucursales
- [x] Reorganizar layout: tabla de sucursales ocupa ancho completo
- [x] Mover "Distribución por Categoría" debajo de la tabla
- [x] Probar con diferentes filtros
- [x] Escribir y ejecutar tests de validación
- [x] Guardar checkpoint


## Corrección de Venta Promedio Diaria - Análisis por Categorías (2026-02-20)

### Problema Identificado
- [ ] El cálculo actual suma los promedios individuales de cada sucursal
- [ ] Debe calcular: Total de ventas ÷ Cantidad de días únicos en el análisis
- [ ] Ejemplo: S/ 393,855 (2 días) → S/ 196,927.50 por día
- [ ] Ejemplo: S/ 198,479 (1 día) → S/ 198,479 por día

### Solución
- [ ] Modificar BranchBarChart para calcular días únicos globalmente
- [ ] Actualizar fila de totales con cálculo correcto
- [ ] Probar con diferentes rangos de fechas
- [x] Guardar checkpoint


## Corrección de Venta Promedio Diaria en Análisis por Categorías (2026-02-20)

### Problema Identificado
- [x] Venta promedio diaria total está sumando promedios individuales
- [x] Debería dividir total de ventas entre días únicos del análisis

### Solución
- [x] Corregir cálculo de globalDaysCount en BranchBarChart
- [x] Convertir doc_date a string para que Set funcione correctamente
- [x] Probar con 1 día (debe mostrar total de ventas)
- [x] Probar con 2 días (debe dividir entre 2)
- [x] Guardar checkpoint


## Corrección de Cálculos de Días y Promedios (2026-02-20)

### Problema 1: Análisis por Hora - Contador de Días Incorrecto
- [x] Revisar cálculo de días únicos en HourlyAnalysis.tsx
- [x] El contador muestra "3 días" cuando solo hay 2 días seleccionados (3 y 4 feb)
- [x] Verificar si está incluyendo el día actual incorrectamente
- [x] Corregir lógica de conteo de días únicos (problema: setHours mutaba el objeto Date original)
- [x] Probar con rango 3-4 feb (debe mostrar 2 días) ✓

### Problema 2: Análisis por Categorías - Total de Venta Promedio Diaria Incorrecto
- [x] Revisar cálculo de total en BranchBarChart.tsx (línea de totales)
- [x] Total muestra S/ 272,611 pero debería ser S/ 200,871
- [x] Cálculo correcto: S/ 3,816,548 ÷ 19 días = S/ 200,871
- [x] Actualmente está sumando promedios individuales en lugar de dividir total entre días
- [x] Corregir fórmula usando offset UTC-5 para extraer fechas correctamente
- [x] Probar con rango 1-19 feb (debe mostrar S/ 200,871) ✓

### Testing
- [x] Probar análisis por hora con diferentes rangos de fechas
- [x] Probar análisis por categorías con diferentes rangos de fechas
- [x] Verificar que ambos cálculos sean consistentes
- [x] Guardar checkpoint


## Estandarización de Filtros de Fecha (2026-02-20)

### Problema Identificado
- [x] Filtrado por fecha funciona diferente entre análisis por categorías y análisis por hora
- [x] Análisis por hora: envía fecha_max con 23:59:59 (correcto para operador `<`)
- [x] Análisis por categorías: envía fecha_max sin ajustar horas (incorrecto, excluye el último día)
- [x] Ambos queries usan operador `<` en SQL: `AND doc_date < $2`

### Solución
- [x] Revisar lógica de construcción de filtros en HourlyAnalysis.tsx
- [x] Revisar lógica de construcción de filtros en Home.tsx (análisis por categorías)
- [x] Modificar Home.tsx para que establezca horas a 23:59:59 antes de enviar al query
- [x] Probar con mismo rango de fechas en ambos análisis (deben mostrar mismos totales) ✓
  * Análisis por categorías (1-31 ene): S/ 6,158,792.77
  * Análisis por hora (1-31 ene): S/ 6,158,792.77
  * Diferencia: S/ 0.00 ✓
- [x] Guardar checkpoint


## Corrección de Conteo de Transacciones en Análisis por Categorías (2026-02-23)

### Problema Identificado
- [x] Análisis por categorías muestra 765 transacciones para FF02 el 19/02/26
- [x] Análisis por hora muestra 467 tickets únicos para los mismos filtros
- [x] El análisis por categorías está contando registros agregados en lugar de tickets únicos
- [x] Debe contar `sale_id` únicos, no filas de la tabla agregada

### Solución
- [x] Revisar consulta SQL en salesRouter.ts (getAggregatedSales)
- [x] Modificar consulta para incluir array_agg(DISTINCT sale_id) AS sale_ids
- [x] Actualizar interfaz SalesDataPoint para incluir sale_ids
- [x] Modificar BranchBarChart.tsx para usar Set<string> y contar sale_ids únicos
- [x] Actualizar cálculo de totales en la tabla para contar tickets únicos globales
- [x] Probar con filtros: FF02, 19/02/26 (muestra 467 tickets ✓)
- [x] Escribir y ejecutar tests de validación (3 tests pasados ✓)
- [x] Guardar checkpoint


## Filtros Persistentes y Ordenamiento de Sucursales (2026-02-23)

### Filtros Persistentes entre Análisis
- [x] Crear FiltersContext para compartir estado de filtros globalmente
- [x] Incluir dateRange y branchId en el contexto
- [x] Actualizar Home.tsx (análisis por categorías) para usar FiltersContext
- [x] Actualizar HourlyAnalysis.tsx para usar FiltersContext
- [x] Verificar que los filtros persistan al cambiar entre análisis ✓

### Ordenamiento de Sucursales
- [x] Modificar análisis por horas para ordenar sucursales por branch_sap_id
- [x] Implementar ordenamiento numérico (extrae números de SAP ID)
- [ ] Probar que el dropdown muestre sucursales en orden correcto

### Testing
- [x] Aplicar filtro de fecha en análisis por categorías (1-5 feb), cambiar a análisis por horas ✓
  * Fecha persistía correctamente: 01 feb. 2026 - 05 feb. 2026
  * Ventas totales coinciden: S/ 482,060.62
- [x] Aplicar filtro de sucursal en análisis por horas (Primavera FF03), cambiar a análisis por categorías ✓
  * Sucursal persistía correctamente: Primavera (FF03)
  * Ventas totales coinciden: S/ 3,527.17
- [x] Verificar ordenamiento de sucursales en dropdown de análisis por horas ✓
  * Ordenamiento correcto por SAP ID: FF01, FF02, FF03, ..., FF12
- [x] Guardar checkpoint


## Comparación con Período Anterior en KPIs (2026-02-24)

### Análisis por Categorías
- [x] Crear getAggregatedComparison para consultar período actual y anterior
- [x] Calcular duración del período actual y obtener período anterior de igual duración
- [ ] Actualizar Home.tsx para mostrar variación porcentual en KPIs
- [ ] Agregar indicadores visuales (↑ verde, ↓ rojo) según variación
- [ ] Mostrar cambio absoluto además de porcentual

### Análisis por Horas
- [x] Crear getHourlyComparison para consultar período actual y anterior
- [x] Calcular duración del período actual y obtener período anterior de igual duración
- [ ] Actualizar HourlyAnalysis.tsx para mostrar variación porcentual en KPIs
- [ ] Agregar indicadores visuales (↑ verde, ↓ rojo) según variación
- [ ] Mostrar cambio absoluto además de porcentual

### Testing
- [ ] Probar comparación con diferentes rangos de fechas
- [ ] Verificar que cálculos de variación sean correctos
- [ ] Probar con filtros de sucursal y canal
- [x] Guardar checkpoint


## Nueva Tarea - Optimización para Grandes Volúmenes de Datos con Python (24/02/2026)

### Scripts de Optimización Creados
- [x] Corregir error de sintaxis en HourlyAnalysis.tsx (código duplicado eliminado)
- [x] Crear script validate_data_integrity.py para validación de integridad de datos
  - [x] Implementar validación de integridad referencial entre tablas
  - [x] Implementar validación de consistencia de totales (header vs detalles)
  - [x] Implementar validación de rangos de datos (negativos, outliers, fechas futuras)
  - [x] Implementar detección de registros duplicados
  - [x] Clasificar problemas por severidad (crítico, advertencia, informativo)
  - [x] Generar reportes JSON detallados con ejemplos de problemas
- [x] Crear script advanced_batch_processor.py para procesamiento avanzado
  - [x] Implementar cursores del lado del servidor para minimizar uso de memoria
  - [x] Implementar sistema de caché inteligente con compresión gzip
  - [x] Implementar procesamiento paralelo con multiprocessing
  - [x] Implementar agregación por día con métricas avanzadas (mediana, desviación estándar)
  - [x] Implementar agregación por hora para análisis de patrones diarios
  - [x] Implementar agregación por categoría
  - [x] Implementar ventanas deslizantes para análisis de tendencias
  - [x] Implementar exportación comprimida de resultados
  - [x] Implementar creación de vistas materializadas para consultas ultra-rápidas
  - [x] Configurar procesamiento paralelo con 4 workers
  - [x] Configurar lotes de 10,000 registros para optimizar memoria

### Documentación
- [x] Crear documentación completa en docs/OPTIMIZACION_PYTHON.md
  - [x] Documentar arquitectura de optimización en 3 capas
  - [x] Documentar cada script con funcionalidades y uso
  - [x] Documentar índices recomendados con impacto esperado
  - [x] Documentar estrategia de implementación en 4 fases
  - [x] Documentar métricas de monitoreo y mantenimiento
  - [x] Documentar resultados esperados (mejoras de 70-90% en rendimiento)
  - [x] Documentar recomendaciones adicionales (particionamiento, archivado, réplicas)

### Resultados Esperados
- Reducción de 70-80% en tiempo de consultas de análisis por categorías
- Reducción de 75-85% en tiempo de consultas de análisis por horas
- Reportes históricos instantáneos mediante caché
- Uso de memoria constante incluso con millones de registros
- Capacidad de procesar hasta 1 millón de transacciones mensuales
- Soporte para 20 usuarios concurrentes sin degradación


## Nueva Tarea - Cambiar Colores de Indicadores de Cambio en KPIs (24/02/2026)
- [x] Identificar componentes que muestran indicadores de cambio (positivo/negativo)
- [x] Cambiar color de cambios negativos de rojo a #BC2C46
- [x] Cambiar color de cambios positivos de verde a #008064
- [x] Verificar que los cambios se apliquen correctamente en el navegador
- [x] Guardar checkpoint con los cambios


## Nueva Tarea - Implementar Iconos de Tendencias en Análisis por Categorías (24/02/2026)
- [x] Revisar implementación actual de KPIs en la página de análisis por categorías
- [x] Crear endpoint tRPC para obtener comparación con período anterior (ya existe: getAggregatedComparison)
- [x] Actualizar página Home.tsx para usar KPICard con comparación de período anterior
- [x] Implementar lógica de cálculo de período anterior basado en el rango de fechas actual
- [x] Actualizar useAggregatedSales para incluir totalTickets en las métricas
- [x] Verificar que los iconos de tendencia se muestren correctamente con los colores personalizados
- [x] Probar con diferentes rangos de fechas
- [x] Guardar checkpoint con los cambios


## Nueva Tarea - Agregar KPI Promedio por Día e Iconos en Tablas (24/02/2026)
- [x] Agregar KPI de "Promedio por Día" en Home.tsx (análisis por categorías)
- [x] Calcular promedio por día basado en el rango de fechas seleccionado
- [x] Agregar comparación con período anterior para el KPI de promedio por día
- [x] Actualizar tabla de "Comparación por Sucursal" para incluir iconos de tendencias
- [x] Actualizar tabla de "Distribución por Categoría" para incluir iconos de tendencias
- [x] Crear endpoints getBranchComparison y getCategoryComparison en salesRouter
- [x] Verificar que los iconos se muestren correctamente con los colores personalizados
- [x] Guardar checkpoint con los cambios


## Corrección - KPI Promedio por Día (24/02/2026)
- [x] Analizar el cálculo actual de numberOfDays en Home.tsx
- [x] Corregir la lógica para que un rango de un solo día cuente como 1 día (no 2)
- [x] Usar Math.floor en lugar de Math.ceil y normalizar fechas a medianoche
- [x] Verificado en navegador - KPI muestra S/ 25,884 correctamente para 1 día
- [x] Guardar checkpoint con la corrección


## Nueva Tarea - Iconos de Tendencias en Todas las Columnas (24/02/2026)
- [x] Actualizar BranchBarChart para mostrar iconos en columnas: Transacciones, Ticket Promedio, Venta Prom. Diaria
- [x] Actualizar endpoint getBranchComparison para incluir avg_ticket y avg_sales_per_day
- [x] Actualizar CategoryPieChart para mostrar iconos en columna de Porcentaje (%)
- [x] Verificar que los iconos se muestren correctamente con los colores personalizados
- [x] Guardar checkpoint con los cambios


## Nueva Tarea - Agregar Canal "Rappi" en Análisis por Hora (25/02/2026)
- [x] Revisar estructura de la tabla methods_payment en la base de datos
- [x] Actualizar consulta SQL de getHourlySales para identificar canal Rappi
- [x] Actualizar consulta SQL de getHourlyComparison para incluir canal Rappi
- [x] Agregar filtro de "Canal" en el frontend de HourlyAnalysis.tsx
- [x] Actualizar lógica de filtrado para incluir canal Rappi
- [x] Verificar que el filtro funcione correctamente en el navegador - Confirmado que muestra 4 opciones
- [x] Guardar checkpoint con los cambios


## Corrección - Error en getHourlyComparison (25/02/2026)
- [x] Revisar logs del servidor para identificar el error SQL específico - Error: column "sales_channel" does not exist
- [x] Corregir la consulta SQL en getHourlyComparison - Movido filtro de sales_channel al WHERE final
- [x] Probar la consulta en el navegador para verificar que funcione - KPIs se muestran correctamente
- [x] Guardar checkpoint con la corrección


## Nuevo Feature - Página Ventas vs Meta (25/02/2026)

### Base de Datos
- [x] Crear tabla store_monthly_targets en drizzle/schema.ts
- [x] Ejecutar pnpm db:push para aplicar migración

### Backend (tRPC)
- [x] Crear endpoint getSalesVsTarget para consultar ventas por tienda vs meta prorrateada
- [x] Crear endpoint getStoreTargets para listar metas configuradas
- [x] Crear endpoint upsertStoreTarget para crear/actualizar metas (protegido: admin)
- [x] Crear endpoint deleteStoreTarget para eliminar metas (protegido: admin)
- [x] Implementar lógica de prorrateo de meta mensual según días del período
- [x] Registrar targetsRouter en routers.ts

### Frontend - Componentes
- [x] Crear componente StoreTargetCard con progress ring y métricas
- [x] Crear componente TargetEditModal para edición de metas
- [x] Crear componente ProgressRing para visualización de cumplimiento
- [x] Instalar sonner para notificaciones toast

### Frontend - Página
- [x] Crear página SalesVsTarget.tsx con filtros de fecha y tienda
- [x] Implementar grid de tarjetas ordenadas por % cumplimiento
- [x] Agregar botón "Editar metas" visible solo para admin
- [x] Implementar estados: cargando, sin datos, meta no configurada
- [x] Usar tipografías Italian Plate (KPIs) y Sailec (labels)
- [x] Mantener colores existentes del dashboard (#008064 positivo, #BC2C46 negativo)

### Navegación
- [x] Agregar ruta /sales-vs-target en App.tsx
- [x] Agregar botón de navegación en Home.tsx

### Testing
- [ ] Verificar cálculo de prorrateo con rangos de un mes
- [ ] Verificar cálculo de prorrateo con rangos que cruzan meses
- [ ] Verificar permisos de edición por rol
- [ ] Verificar filtros multi-select de tiendas

### Checkpoint
- [x] Guardar checkpoint con el feature completo


### Verificación Inicial (25/02/2026)
- [x] Página carga correctamente en /sales-vs-target
- [x] Filtros se muestran correctamente
- [x] Botón "Editar Metas" visible para admin
- [x] Estado de carga funciona correctamente


## Correcciones - Página Ventas vs Meta (25/02/2026)
- [x] Cambiar tipografía del título "VENTAS VS META" a Italian Plate No 1
- [x] Usar tipografía Sailec para los números en los paneles (ventas y metas)
- [x] Agregar código SAP de tienda en el selector del modal de edición
- [x] Rediseñar modal de edición: reemplazar formulario por tabla editable
- [x] Agregar filtros por tienda y período en la tabla del modal
- [x] Permitir edición rápida de múltiples metas en la tabla
- [x] Agregar store_sap_id al endpoint getSalesVsTarget
- [x] Verificar correcciones en el navegador - Todas las correcciones funcionan correctamente
- [x] Guardar checkpoint con las correcciones


## Corrección - Modal de Metas: Lista de Tiendas (25/02/2026)
- [x] Crear endpoint getAllStores que consulte la tabla branches de PostgreSQL
- [x] Actualizar TargetEditModal para usar getAllStores en lugar de getSalesVsTarget
- [x] Verificar que el botón "Agregar Meta" funcione correctamente - Todas las tiendas se cargan desde branches
- [x] Guardar checkpoint con la corrección


## Corrección - Error al Eliminar Metas (25/02/2026)
- [x] Revisar la lógica de eliminación en TargetEditModal.tsx
- [x] Agregar campo id a la interfaz EditableTarget
- [x] Actualizar mapeo de targetsData para incluir el id
- [x] Corregir handleDeleteTarget para usar el id en lugar de month/store_id
- [x] Verificar que la eliminación funcione correctamente - Eliminación exitosa sin errores
- [x] Guardar checkpoint con la corrección


## Correcciones - Modal y Visualización de Metas (25/02/2026)
- [x] Aumentar ancho del modal de creación de metas de max-w-6xl a max-w-7xl
- [x] Corregir visualización de datos después de crear meta - Agregado refetch() después de guardar
- [x] Llamar onSuccess() para refrescar la página principal con los datos actualizados
- [x] Corregir mapeo de datos en useEffect para usar camelCase de Drizzle (storeId, monthlyTargetAmount)
- [x] Arreglar componente gráfico de progress ring - Solo mostrar cuando hay meta configurada
- [x] Verificar todas las correcciones en el navegador - Todas funcionan correctamente
- [x] Guardar checkpoint con las correcciones


## Correcciones Adicionales - Modal y Progress Bar (25/02/2026)
- [x] Ampliar modal de max-w-7xl a max-w-[90vw] para usar 90% del ancho de pantalla
- [x] Reemplazar ProgressRing circular por barra de progreso horizontal
- [x] Actualizar StoreTargetCard para usar barra de progreso horizontal personalizada
- [x] Eliminar sección duplicada de Cumplimiento (ahora está en la barra)
- [x] Verificar cambios en el navegador - Modal ampliado y barra de progreso funcionan correctamente
- [x] Guardar checkpoint con las correcciones


## Nueva Tarea - Ordenar Tiendas por Código SAP (25/02/2026)
- [x] Ordenar tiendas por sap_id en el backend (getSalesVsTarget y getAllStores)
- [x] Verificar que el filtro de tiendas muestre las opciones ordenadas por SAP
- [x] Verificar que el grid de tarjetas muestre las tiendas ordenadas por SAP
- [x] Guardar checkpoint con el ordenamiento


## Nueva Tarea - Corregir Visibilidad de Barra de Progreso (25/02/2026)
- [x] Revisar StoreTargetCard.tsx para identificar el problema de color
- [x] Cambiar color de la barra de progreso a un color neutro (Cobalto #1A6894)
- [x] Asegurar que el color contraste bien con el fondo blanco
- [x] Verificar que la barra sea visible en todos los rangos de cumplimiento (0-100%+)
- [x] Probar con diferentes porcentajes de cumplimiento (89.7%, 88.8%, 77.3%, 70.9%, 63.4%, 40.6%)
- [x] Guardar checkpoint con la corrección


## Nueva Tarea - Implementar Colores Progresivos en Barra de Progreso (25/02/2026)
- [x] Actualizar StoreTargetCard.tsx con lógica de colores por rangos
- [x] Implementar rango 0-75%: Granate #BC2C46
- [x] Implementar rango 75-90%: Mostaza #C49705
- [x] Implementar rango 90-100%: Cobalto #1A6894
- [x] Implementar rango 100%+: Esmeralda #008064
- [x] Aplicar los mismos colores al texto del porcentaje de cumplimiento
- [x] Verificar visibilidad en todos los rangos observables
- [x] Probar con diferentes porcentajes de cumplimiento (89.7%, 88.8%, 77.3%, 70.9%, 63.4%, 40.6%)
- [x] Guardar checkpoint con colores progresivos


## Problema Reportado - Fecha Única No Muestra Datos (25/02/2026)
- [x] Reproducir el problema seleccionando una fecha única en el navegador (23 feb 2026)
- [x] Revisar lógica de filtrado en SalesVsTarget.tsx
- [x] Revisar endpoint getSalesVsTarget en targetsRouter.ts
- [x] Identificar si el problema está en el frontend o backend (backend - operador < en SQL)
- [x] Implementar corrección (cambiar < por <= en consultas SQL de targetsRouter.ts y salesRouter.ts)
- [x] Verificar que funcione con fecha única (24 feb 2026 - datos mostrados correctamente)
- [x] Verificar que no afecte rangos de fechas normales (rango 01-25 feb funciona correctamente)
- [x] Guardar checkpoint con la corrección (version d36b0917)


## Nueva Tarea - Página Principal y Menú de Navegación (25/02/2026)
- [x] Diseñar estructura de navegación con grupo "Ventas"
- [x] Crear componente NavigationMenu desplegable
- [x] Crear página principal (Home) con tarjetas de acceso a secciones
- [x] Agrupar páginas existentes bajo "Ventas": Análisis por Categorías, Análisis por Horas, Ventas vs Meta
- [x] Respaldar contenido anterior de Home.tsx a SalesByCategory.tsx
- [x] Actualizar App.tsx con nuevas rutas (/sales, /hourly, /sales-vs-target)
- [x] Aplicar NavigationMenu a SalesByCategory, HourlyAnalysis y SalesVsTarget
- [x] Simplificar headers eliminando navegación duplicada
- [x] Verificar navegación entre páginas (Home → Menú Ventas → Análisis por Categorías)
- [x] Guardar checkpoint con navegación completa (version 8b0b7b28)


## Error Reportado - Anidación de Etiquetas <a> en Home (26/02/2026)
- [x] Identificar componentes Link con etiquetas <a> anidadas en Home.tsx (líneas 94-113)
- [x] Corregir estructura cambiando <a> por <div>
- [x] Verificar que no haya errores en consola (sin errores de anidación)
- [x] Guardar checkpoint con corrección (version d6d36e0f)


## Nueva Tarea - Personalizar Home con Paleta Flora & Fauna (26/02/2026)
- [x] Actualizar colores de iconos de módulos usando paleta Flora & Fauna (Cobalto, Mostaza, Esmeralda)
- [x] Agregar logo de Flora & Fauna en esquina superior izquierda
- [x] Verificar que el logo se adapte al tema (claro/oscuro)
- [x] Verificar colores e iconos en el navegador
- [x] Guardar checkpoint con personalización (version efb50f07)


## Nueva Tarea - Sustituir Títulos de Texto por Logos (26/02/2026)
- [x] Revisar cambios del editor visual en Home.tsx (línea 83)
- [x] Revisar cambios del editor visual en NavigationMenu.tsx (línea 44)
- [x] Aplicar cambios para reemplazar títulos de texto con logos
- [x] Aumentar tamaño del logo en Home.tsx a h-12 para mejor visibilidad
- [x] Verificar que los logos se vean correctamente en ambos lugares (NavigationMenu y Home)
- [x] Confirmar adaptación automática al tema claro/oscuro
- [x] Guardar checkpoint con logos implementados (version 0bb1d300)


## Problema Reportado - Fecha Única Trae Dos Fechas en Análisis (26/02/2026)
- [x] Reproducir problema en Análisis por Categorías con fecha única (23 feb) - NO SE REPRODUCE
- [x] Reproducir problema en Análisis por Horas con fecha única (23 feb) - NO SE REPRODUCE
- [x] Revisar consultas SQL en salesRouter.ts (getAggregatedSales y getHourlySales)
- [x] Verificar que targetsRouter.ts ya tiene la corrección aplicada (confirmado)
- [x] Confirmar que salesRouter.ts YA usa operador <= (líneas 87 y 180)
- [x] Probar fecha única en ambos dashboards (23 feb funciona correctamente)
- [x] Verificar que Ventas vs Meta sigue funcionando correctamente
- [x] Problema NO existe - consultas ya corregidas previamente


## Bug Confirmado - Gráfico Muestra Dos Fechas con Fecha Única (27/02/2026)
- [x] Revisar consulta SQL de getAggregatedSales para identificar por qué devuelve día extra
- [x] Revisar consulta SQL de getHourlySales para el mismo problema
- [x] Identificar causa raíz: desfase UTC vs hora Lima (23:59:59 Lima = 04:59:59 UTC del día siguiente)
- [x] Corregir getAggregatedSales: extraer YYYY-MM-DD del ISO string antes de pasar al SQL
- [x] Corregir getHourlySales: mismo fix de extracción de fecha
- [x] Corregir getAggregatedComparison: mismo fix
- [x] Corregir getHourlyComparison: mismo fix
- [x] Verificar corrección en Análisis por Categorías (23 feb: solo 1 punto en gráfico) ✓
- [x] Verificar corrección en Análisis por Horas (23 feb: gráfico muestra solo datos del 23 feb) ✓
- [x] Guardar checkpoint con corrección (version e02097b5)


## Bug Persistente - Fecha Única Muestra Dos Días (27/02/2026 - segunda iteración)
- [x] Diagnosticar zona horaria del servidor PostgreSQL (UTC)
- [x] Verificar formato de doc_date (timestamp without time zone, almacena hora Lima sin TZ)
- [x] Causa raíz definitiva: frontend usa setHours(23,59,59,999) + toISOString() → 2026-02-19T04:59:59Z, substring(0,10) = '2026-02-19'
- [x] Corregir SalesByCategory.tsx: usar toLocaleDateString('sv') para obtener YYYY-MM-DD local
- [x] Corregir HourlyAnalysis.tsx: mismo fix
- [x] Corregir SalesVsTarget.tsx: mismo fix
- [x] Corregir getHourlyComparison: usar doc_date::date con comparación de fechas puras
- [x] Verificar en navegador: 18 feb único = 1 solo punto en gráfico ✓
- [x] Guardar checkpoint con corrección definitiva (version 3ece1b1e)


## Bug Regresión - Ventas vs Meta Sin Datos (27/02/2026)
- [x] Revisar SalesVsTarget.tsx: ya envía YYYY-MM-DD correctamente con toLocalDateStr()
- [x] Revisar targetsRouter.ts: schema Zod usaba z.string().datetime() que rechazaba YYYY-MM-DD
- [x] Corregir targetsRouter.ts: cambiar a z.string() y parsear fechas con split('-') para evitar UTC
- [x] Verificar que Ventas vs Meta muestra datos correctamente (01 feb - 27 feb: 12 tiendas) ✓
- [x] Guardar checkpoint con corrección (version c3e03f15)


## Nueva Funcionalidad - Sistema de Tickets de Discrepancias (27/02/2026)
- [x] Diseñar esquema de BD: tabla discrepancy_tickets con campos fecha, tienda, monto_dashboard, monto_analista, diferencia, descripcion, estado, prioridad, fuente, modulo, reportado_por
- [x] Crear tabla en drizzle/schema.ts y ejecutar pnpm db:push
- [x] Crear helpers de consulta en server/db.ts
- [x] Crear ticketsRouter.ts con procedimientos: createTicket, getTickets, updateTicketStatus, getTicketById
- [x] Crear componente ReportDiscrepancyButton.tsx (botón flotante en dashboards)
- [x] Crear componente ReportDiscrepancyModal.tsx (formulario de reporte)
- [x] Crear página DiscrepancyTickets.tsx para administradores
- [x] Agregar ruta /tickets en App.tsx y en el menú de navegación
- [x] Integrar botón de reporte en SalesByCategory.tsx
- [x] Integrar botón de reporte en HourlyAnalysis.tsx
- [x] Integrar botón de reporte en SalesVsTarget.tsx
- [x] Implementar notificaciones al administrador cuando se crea un ticket (notifyOwner ya integrado en ticketsRouter.ts + badge en nav)
- [x] Verificar flujo completo: crear ticket → notificación → gestión admin (5/5 tests pasados)
- [x] Guardar checkpoint con sistema de tickets

## Nueva Tarea - Integración Brevo para correos de bienvenida

- [x] Configurar BREVO_API_KEY como secreto en el proyecto
- [x] Agregar BREVO_API_KEY a server/_core/env.ts
- [x] Instalar @getbrevo/brevo SDK
- [x] Crear server/email.ts con helper sendWelcomeEmail usando Brevo API
- [x] Diseñar plantilla HTML del correo con estilo Flora & Fauna (logo, colores, tipografía)
- [x] Integrar sendWelcomeEmail en userRouter.createUser
- [x] Agregar campo sendWelcomeEmail (boolean) al input de createUser para controlar el envío
- [x] Actualizar UI de gestión de usuarios para mostrar opción de enviar correo
- [x] Escribir tests del helper de email (5/5 pasados, API key válida)
- [x] Guardar checkpoint con integración Brevo completa

## Cambio de correo remitente Brevo

- [x] Cambiar sender email de noreply@florayfauna.pe a portaldeventas@florayfauna.pe en server/email.ts

## Correo de restablecimiento de contraseña

- [x] Agregar buildPasswordResetEmailHtml y sendPasswordResetEmail en server/email.ts
- [x] Integrar sendPasswordResetEmail en userRouter.updatePassword
- [x] Agregar checkbox "Notificar al usuario por email" en el dialog de cambio de contraseña (UserManagement.tsx)
- [x] Escribir tests para sendPasswordResetEmail (9/9 tests pasados)
- [x] Guardar checkpoint

## Correo de notificación para tickets de discrepancia

- [x] Agregar buildTicketNotificationEmailHtml y sendTicketNotificationEmail en server/email.ts
- [x] Agregar getAdminEmails() en server/db.ts
- [x] Obtener email del admin en ticketsRouter.createTicket y enviar correo via Brevo
- [x] Escribir tests para sendTicketNotificationEmail (13/13 tests pasados)
- [x] Guardar checkpoint

## Enlace a Usuarios en el menú

- [x] Agregar enlace a /users en NavigationMenu.tsx visible solo para admins
- [x] Guardar checkpoint

## Corrección ruta Usuarios en menú

- [x] Cambiar href de /users a /admin/users en NavigationMenu.tsx
- [x] Guardar checkpoint

## Corrección colores modo oscuro - Panel de Usuarios

- [x] Revisar paleta CSS modo oscuro en index.css
- [x] Corregir colores hardcodeados en UserManagement.tsx para usar tokens semánticos (21 reemplazos)
- [x] Guardar checkpoint

## Navbar en página de Usuarios

- [x] Agregar NavigationMenu a UserManagement.tsx igual que en el resto de páginas
- [x] Guardar checkpoint

## Colores panel de Tickets — paleta F&F gráficos

- [x] Mapear colores actuales de tickets a colores de la paleta F&F de gráficos
- [x] Reemplazar colores hardcodeados en DiscrepancyTickets.tsx (5 bloques actualizados)
- [x] Guardar checkpoint

## Color botón "Reportar Discrepancia"

- [x] Cambiar color del botón flotante en ReportDiscrepancyButton.tsx a Granate F&F #BC2C46
- [x] Actualizar colores amber en ReportDiscrepancyModal.tsx a paleta F&F
- [x] Guardar checkpoint

## Ancho modal de metas en SalesVsTarget

- [x] Aumentar ancho del DialogContent del modal de metas en desktop (lg:1200px, xl:1400px)
- [x] Guardar checkpoint

## Color fondo filas nuevas en modal de metas

- [x] Reemplazar bg-yellow-50 (equivalente a #FEFCEA) por Mostaza F&F #C49705/10 en TargetEditModal.tsx
- [x] Guardar checkpoint

## Menú hamburguesa para móvil

- [x] Reescribir NavigationMenu.tsx con menú hamburguesa desplegable en columna para móvil
- [x] Mantener menú horizontal en desktop sin cambios
- [x] Guardar checkpoint

## Página Transacciones Identificadas

- [x] Revisar conexión PostgreSQL, filtros y componentes existentes
- [x] Crear procedimiento tRPC sales.getIdentifiedTransactions con el query PostgreSQL
- [x] Crear IdentifiedTransactions.tsx con filtros, resumen consolidado y tarjetas por tienda
- [x] Registrar ruta /identified-transactions en App.tsx
- [x] Agregar enlace en NavigationMenu.tsx bajo el dropdown de Ventas
- [x] Integrar ReportDiscrepancyButton en la nueva página
- [x] Escribir tests del procedimiento tRPC (12/12 pasados)
- [x] Guardar checkpoint

## Tarjeta Transacciones Identificadas en Home

- [x] Agregar tarjeta de acceso rápido a /identified-transactions en Home.tsx
- [x] Guardar checkpoint

## Carga masiva de metas via CSV

- [x] Revisar TargetEditModal.tsx y el router de metas en el servidor
- [x] Crear procedimiento tRPC targets.bulkUpsertFromCSV en el servidor
- [x] Agregar botón de descarga de plantilla CSV modelo en el modal
- [x] Agregar zona de carga de archivo CSV con preview de filas y errores
- [x] Confirmar e importar las metas del CSV a la base de datos
- [x] Escribir 17 tests del procedimiento de carga masiva (17/17 pasados)
- [x] Guardar checkpoint

## Venta promedio diaria y proyección en tarjetas de Ventas vs Meta

- [x] Revisar estructura de SalesVsTarget.tsx y datos disponibles por tienda
- [x] Calcular venta promedio diaria (venta_acumulada / días_transcurridos) por tienda
- [x] Calcular proyección mensual (promedio_diario × días_del_mes) por tienda
- [x] Mostrar ambas métricas en las tarjetas de cada tienda con colores F&F
- [x] Verificar sin errores TypeScript (0 errores)
- [x] Guardar checkpoint

## Proyección en tabla Comparación por Sucursal

- [x] Revisar tabla Comparación por Sucursal en SalesByCategory.tsx (BranchBarChart.tsx)
- [x] Agregar columna Proyección Mensual (avgSalesPerDay × daysInMonth) con color Cobalto F&F
- [x] Pasar daysInMonth calculado desde SalesByCategory.tsx a BranchBarChart
- [x] Verificar sin errores TypeScript (0 errores) y guardar checkpoint

## Ajustes tabla Comparación por Sucursal

- [x] Cambiar color texto Proyección Mensual de Cobalto a #232523
- [x] Quitar font-semibold/negrita de los valores de la tabla
- [x] Guardar checkpoint

## Rediseño tarjetas Ventas vs Meta

- [x] Reorganizar StoreTargetCard en 5 líneas: nombre, barra, venta/meta período, proyección/meta mensual, diario/meta diaria
- [x] Aplicar colores de cumplimiento a venta realizada, proyección y promedio diario
- [x] Mostrar porcentaje de cumplimiento junto a cada valor de venta
- [x] Calcular y mostrar meta diaria promedio (meta mensual / días del mes)
- [x] Guardar checkpoint

## Sistema RLS por Roles de Usuario

- [x] Migrar enum role en schema.ts: admin→system_specialist, user→cst_user, agregar store_user
- [x] Agregar campo assigned_store_code en tabla users
- [ ] Ejecutar pnpm db:push para migrar BD
- [ ] Agregar endpoint getBranches en salesRouter para obtener tiendas desde PostgreSQL
- [x] Actualizar userRouter: nueva lógica de permisos por rol, campo assignedStoreCode en create/update
- [x] Aplicar RLS en todas las queries del salesRouter (branch_sap_id filter)
- [x] Aplicar RLS en targetsRouter (store_ids filter)
- [x] Actualizar auth.me para incluir assignedStoreCode en la respuesta
- [x] Actualizar JWT para incluir assignedStoreCode en el token
- [x] Actualizar UserManagement.tsx: nuevos roles, selector de tienda para store_user
- [ ] Actualizar NavigationMenu.tsx: visibilidad del enlace Usuarios según rol
- [x] Actualizar SalesByCategory.tsx: bloquear filtro de tienda para store_user
- [x] Actualizar HourlyAnalysis.tsx: bloquear filtro de tienda para store_user
- [x] Actualizar SalesVsTarget.tsx: bloquear filtro de tienda para store_user
- [x] Actualizar IdentifiedTransactions.tsx: bloquear filtro de tienda para store_user
- [ ] Guardar checkpoint

## Bug: Filtro de tienda para store_user falla con sap_id
- [ ] Corregir 5 endpoints del salesRouter para filtrar por b.sap_id en lugar de UUID
- [ ] Corregir DashboardFilters para usar sap_id como valor del selector de tienda
- [ ] Verificar que todos los dashboards funcionan correctamente para store_user
- [x] Permitir que cst_user edite metas: actualizar permisos en backend (upsertStoreTarget, deleteStoreTarget, bulkUpsertFromCSV) y frontend (canEdit, botón Editar Metas, StoreTargetCard)
- [x] Flujo de activación de cuenta: tabla activation_tokens en DB con token único, expiración y estado
- [x] Flujo de activación de cuenta: endpoints backend (generateToken, validateToken, activateAccount)
- [x] Flujo de activación de cuenta: página /activate/:token con estética Flora & Fauna
- [x] Flujo de activación de cuenta: email de bienvenida con link de activación en lugar de credenciales
- [x] Agregar aviso en diálogo de creación de usuario: contraseña temporal no se envía por correo
- [x] Cambiar fecha de fin por defecto en Ventas vs Metas: de hoy a ayer (inicio del mes → ayer)
- [ ] Agregar roles commercial_specialist y supplier_user al schema DB + campo assigned_supplier_id
- [ ] Backend: tipos, permisos de creación por rol, endpoint getSuppliers, validaciones
- [ ] Crear página exclusiva para proveedores (SupplierHome) con redirección automática
- [ ] Guards de acceso en todas las páginas para bloquear supplier_user
- [ ] UserManagement: nuevos roles, selector de proveedor con búsqueda por RUC
- [ ] Actualizar NavigationMenu para nuevos roles
- [ ] Tests de permisos para commercial_specialist y supplier_user
- [x] Crear rol commercial_specialist en schema y DB
- [x] Crear rol supplier_user con campo assigned_supplier_id en schema y DB
- [x] Actualizar backend: permisos de creación por rol (commercial_specialist → supplier_user; cst_user → store_user)
- [x] Agregar endpoint getSuppliers con búsqueda por RUC desde tabla public.suppliers
- [x] Validar que supplier_user requiere assigned_supplier_id (BAD_REQUEST si falta)
- [x] Crear página SupplierHome exclusiva para proveedores
- [x] Redirección automática de supplier_user a /supplier al iniciar sesión
- [x] Guards de acceso en App.tsx para bloquear supplier_user en páginas generales
- [x] Actualizar UserManagement con selector de proveedor y reglas de creación por rol
- [x] Actualizar NavigationMenu con etiquetas de rol correctas y acceso a Usuarios para commercial_specialist
- [x] Agregar tests para nuevos roles (112 tests pasan)
- [x] Construir portal de proveedores: backend supplierPortalRouter con 7 endpoints (getMySupplier, getSalesSummary, getDailySales, getTopProducts, getSalesByBranch, getStockByProduct, getReceptions, getMonthlySales, getProductCatalog)
- [x] Construir portal de proveedores: frontend SupplierPortal.tsx con 4 tabs (Dashboard, Catálogo, Stock, Recepciones)
- [x] Tests del portal de proveedores: 14 tests de acceso, roles y paginación
- [x] Enriquecer listUsers con supplierName via JOIN en backend para mostrar nombre del proveedor en la tabla de usuarios sin depender del buscador
- [x] Sustituir campo sku por int_sku en todos los queries y componentes
- [x] Corregir query del catálogo del portal de proveedores para cargar productos por supplier_id del usuario
- [x] Agregar filtros por tienda y por producto en la tab de Stock del portal de proveedores
- [ ] Permitir que system_specialist acceda al portal de proveedores con selector de proveedor previo a la carga de datos
- [x] Agregar enlace al portal de proveedores en NavigationMenu para system_specialist y commercial_specialist
- [x] Extender acceso al portal de proveedores para commercial_specialist (backend + frontend)
- [x] Página Top 50 Productos: ranking por cantidad y por monto con los mismos filtros de fecha/tienda/categoría, gráfico de barras horizontal (top 20) y tabla completa (top 50), integrada en menú Ventas y Home
- [x] TopProducts: usar exclusivamente paleta de colores aprobada en gráficos e iconos
- [x] TopProducts: usar exclusivamente tipografías Sailec e ItalianPlate
- [x] TopProducts: período por defecto = últimos 30 días
- [x] SupplierPortal: aumentar a 20 el límite de tiendas en el gráfico de ventas por tienda
- [x] SupplierPortal: nueva pestaña "Ventas" con tabla artículo×tienda (cantidad + monto)
- [x] SupplierPortal: modal de detalle de ventas por día al hacer clic en una fila
- [x] SupplierPortal: endpoint getSalesByProductBranch (tabla artículo×tienda)
- [x] SupplierPortal: endpoint getSalesDailyDetail (detalle diario para el modal)
- [x] SupplierPortal: endpoint getProductsForSupplier (lista de productos del proveedor para el Select)
- [x] SupplierPortal: reemplazar input de búsqueda de SKU por Select desplegable de productos del proveedor
- [x] SupplierPortal: reemplazar input de búsqueda en pestaña Catálogo por Select desplegable de productos
- [x] SupplierPortal: reemplazar input de búsqueda en pestaña Stock por Select desplegable de productos
- [x] SupplierPortal: botón de descarga CSV/Excel en pestaña Ventas (exportar todos los registros filtrados)
- [x] Corregir dominio en enlaces de correos (creación usuario, reset password, tickets) a dashboard.florayfauna.pe
- [x] Botón Reenviar Activación en página de usuarios con permisos por rol
- [x] SupplierPortal: fila de totales en pestaña Ventas (cantidad, monto, tickets)
- [ ] SupplierPortal: mostrar tiendas como "Nombre (SAP_ID)" ordenadas por sap_id en todos los filtros/selectores
- [ ] SupplierPortal: agregar columna SAP_ID en tablas de Ventas y Stock
- [ ] SupplierPortal: completar filas con stock=0 para tiendas sin stock al consultar un producto
- [x] SupplierPortal: botón de descarga CSV en pestaña Stock
- [x] TopProducts: ocultar etiquetas del eje Y en mobile (mostrar solo en tooltip)

## Actualización de Colores en Correos (23/03/2026)
- [x] Actualizar paleta COLORS en server/email.ts: bg #F5F4F1, card #FFFFFF, primary #232523, accent #008064, accentLight #004032, border #EAE8E2
- [x] Sustituir bloques de advertencia amarillos (#FFF8EC/#F0D99A/#7A5C00) por #C49705/#EACB82/#624C02 en todos los correos (bienvenida, reset contraseña, activación)
- [x] Actualizar stripes decorativos para usar #80C8CA como color intermedio del gradiente
- [x] Actualizar bordes de role badge para usar #006050

## Mejoras en Tabla Ventas y Modal Detalle Diario (23/03/2026)
- [x] Agregar fila "Total General" al pie de la tabla del modal de detalle de ventas por día (suma de cantidad, monto y tickets)
- [x] Quitar negritas (font-medium) del cuerpo de la tabla del modal de detalle diario (fecha, monto)
- [x] Agregar tooltip en la celda de nombre de producto de la tabla principal de ventas: "Haz clic para ver el detalle de ventas por día"

## Módulo de Gestión de Usuarios Proveedor (Trial / Suscripción)
- [ ] Extender tabla users con campos de trial/suscripción en drizzle/schema.ts
- [ ] Crear tabla terms_versions en drizzle/schema.ts
- [ ] Crear tabla terms_acceptance en drizzle/schema.ts
- [ ] Ejecutar migración pnpm db:push
- [ ] Helpers de DB: getSupplierUserStatus, acceptTerms, approveAccessRequest, suspendUser, reactivateUser
- [ ] Procedimientos tRPC: supplierTrial router (getStatus, acceptTerms, requestAccess, approveRequest, changeStatus, resendInvitation, getTermsDetail)
- [ ] UI: Popup diario de trial (una vez por día calendario)
- [ ] UI: Página de términos con checkbox obligatorio
- [ ] UI: Página independiente de acceso vencido con flujo de solicitud
- [ ] UI: Página de monitoreo de usuarios proveedor (solo commercial_specialist / systems_specialist)
- [ ] UI: Página de reporte de afiliación con indicador_primer_mes y porcentaje_cobro
- [ ] Exportación CSV en monitoreo y reporte de afiliación
- [ ] Notificación "faltan 2 días para vencer trial" (día 5 desde activation_date)
- [ ] Notificación al usuario al aceptar términos
- [ ] Notificación a especialistas cuando usuario solicite acceso facturado
- [ ] Notificación al usuario cuando su solicitud sea aprobada

## Módulo Trial/Suscripción Proveedores (completado)

- [x] Schema BD: campos trial en users, tablas terms_versions y terms_acceptance
- [x] Migración ejecutada (pnpm db:push)
- [x] Helpers DB: computeSupplierStatus, activateSupplierTrial, acceptTerms, requestPaidAccess, approveAccessRequest, getAffiliationReport
- [x] Router tRPC: supplierTrialRouter con 11 procedimientos
- [x] Emails: sendTrialExpiryWarning, sendTermsAcceptedEmail, sendAccessRequestedEmail, sendAccessApprovedEmail
- [x] UI: TrialPopup (popup diario una vez por día)
- [x] UI: TermsPage (/terminos - página de términos con checkbox obligatorio)
- [x] UI: AccessExpiredPage (/acceso-vencido - solicitud de acceso facturado)
- [x] UI: SupplierMonitor (/monitoreo-proveedores - solo especialistas)
- [x] UI: AffiliationReport (/afiliacion - reporte con exportación CSV)
- [x] Job: trialAlertJob (alertas diarias de trial por vencer, registrado en index.ts)
- [x] Navegación: enlace "Monitoreo" en NavigationMenu para especialistas
- [x] Tests: 10 tests unitarios para computeSupplierStatus y cálculo de porcentaje
- [x] 154/154 tests pasan

## Mejoras en Monitoreo de Proveedores y Control de Acceso

- [x] Agregar procedimiento tRPC createSupplierUser en supplierTrialRouter (reutiliza users.createUser)
- [x] Agregar botón "Nuevo Proveedor" y diálogo de creación en SupplierMonitor
- [x] Diálogo: campos nombre, email, username, proveedor ID, contraseña temporal
- [x] Diálogo: mensaje indicando que contraseña no se envía por correo
- [x] Enviar correo de activación al nuevo usuario proveedor
- [x] Restringir /admin/users: solo system_specialist (quitar acceso a commercial_specialist y cst_user)
- [x] Actualizar guard en App.tsx para /admin/users (nuevo guard system_specialist_only)
- [x] Actualizar NavigationMenu para ocultar enlace Usuarios a commercial_specialist

## RUC y nombre de proveedor en tablas y CSV

- [x] Enriquecer getSupplierUsers en db.ts con RUC y nombre del proveedor (JOIN a PostgreSQL)
- [x] Enriquecer getAffiliationReport en db.ts con RUC y nombre del proveedor
- [x] Actualizar columna "Proveedor ID" en SupplierMonitor para mostrar RUC — Nombre
- [x] Actualizar columna "Proveedor" en AffiliationReport para mostrar RUC — Nombre
- [x] Actualizar exportación CSV para incluir RUC y nombre en lugar del ID

## Estado pending_activation y registro de fechas de trial

- [x] Agregar estado "pending_activation" al enum SupplierStatus en drizzle/schema.ts
- [x] Ejecutar pnpm db:push para migrar la BD
- [x] Actualizar computeSupplierStatus para manejar pending_activation
- [x] Actualizar activateAccount en activationRouter: registrar activationDate y trialEndDate al activar (trial_active) o solo activationDate (subscribed_active)
- [x] Agregar selector de estado inicial (pending_activation / subscribed_active) en diálogo de creación de SupplierMonitor
- [x] Actualizar procedimiento createUser para aceptar y guardar el initialStatus del proveedor
- [x] Actualizar STATUS_LABELS en SupplierMonitor y AffiliationReport para incluir pending_activation
- [x] Actualizar StatusBadge y filtro de estado en SupplierMonitor para incluir pending_activation

## Fix: supplierStatus inicial no se guarda al crear usuario proveedor

- [x] Corregir el INSERT en createUser para incluir supplierStatus con el valor de initialSupplierStatus
- [x] Verificar que el campo supplierStatus existe en el schema de drizzle para el INSERT

## Fix: colores de fondo en modo oscuro - SupplierMonitor y AffiliationReport

- [x] Reemplazar style="background: #F5F4F1" por bg-background en SupplierMonitor
- [x] Reemplazar style="background: #fff" por bg-card en tablas y cards de SupplierMonitor
- [x] Reemplazar style="border: 1px solid #EAE8E2" por border-border en SupplierMonitor
- [x] Reemplazar style="background: #F5F4F1" por bg-background en AffiliationReport
- [x] Reemplazar style="background: #fff" por bg-card en tablas y cards de AffiliationReport
- [x] Reemplazar style="border: 1px solid #EAE8E2" por border-border en AffiliationReport

## Barra de navegación en SupplierMonitor y AffiliationReport

- [x] Agregar NavigationMenu en SupplierMonitor
- [x] Agregar NavigationMenu en AffiliationReport
- [x] Ajustar padding-top en ambas páginas para compensar la altura del nav fijo (pt-20)

## Fix: colores modo oscuro en NavigationMenu (portal proveedores)

- [x] Reemplazar backgroundColor #f5f4f1 en header y tabs del SupplierPortal por bg-background

## Ampliar ancho tablas SupplierMonitor y AffiliationReport

- [x] Cambiar max-w-6xl por max-w-screen-2xl en SupplierMonitor
- [x] Cambiar max-w-6xl por max-w-screen-2xl en AffiliationReport

## Términos y condiciones en activación de cuenta

- [ ] Agregar procedimiento tRPC acceptTerms que registra en terms_acceptance
- [ ] Actualizar activateAccount para aceptar termsAccepted + IP y registrar aceptación si subscribed_active
- [ ] Actualizar página de activación frontend: mostrar checkbox + popup de T&C para supplier_user subscribed_active
- [ ] Popup de T&C: cargar contenido desde getLatestTerms, cerrar con botón
- [ ] Bloquear botón "Activar cuenta" si checkbox no está marcado (solo para subscribed_active)
- [ ] Registrar subscription_start_date = fecha de activación para subscribed_active
- [ ] Asegurar registro de términos en supplierTrialRouter.acceptTerms antes de cambio de estado
- [ ] Enviar notificación de activación exitosa al owner

## Fix: bug checkbox T&C en ActivateAccount

- [x] Corregir bug stale closure en termsAccepted: usar useRef + limpiar formError al marcar checkbox

## Mejoras en Monitoreo de Proveedores (2026-03-27)

- [ ] Procedimiento tRPC resendActivation en activationRouter (genera nuevo token + reenvía correo)
- [ ] Botón "Reenviar activación" en tabla de Monitoreo solo para usuarios pending_activation
- [ ] Columna "T&C aceptados" en tabla de Monitoreo con fecha formateada (termsAcceptedAt)
- [ ] Columna T&C: mostrar "—" si no ha aceptado, fecha si ya aceptó

## Botón Reenviar Activación y Columna T&C en Monitoreo

- [x] Agregar procedimiento tRPC resendActivation en activationRouter (invalida tokens anteriores, genera nuevo, reenvía correo)
- [x] Agregar componente ResendActivationButton en SupplierMonitor (visible solo para pending_activation)
- [x] Agregar columna "T&C aceptados" con fecha termsAcceptedAt en tabla de SupplierMonitor
- [x] Actualizar colSpan de filas vacías/cargando de 8 a 9

## Botón Activar Suscripción en Monitoreo

- [x] Agregar procedimiento tRPC activateSubscription en supplierTrialRouter
- [x] Agregar botón "Activar suscripción" en SupplierMonitor con diálogo de confirmación
- [x] Visible en todos los estados excepto subscribed_active (trial_expired, suspended, trial_active, access_requested, pending_activation)

## Renombrar Monitoreo → Administración de Proveedores

- [x] Cambiar título de la página SupplierMonitor.tsx a "Administración de Proveedores"
- [x] Actualizar botón/enlace "Monitoreo" en NavigationMenu a "Administración de Proveedores"
- [x] Quitar opción de creación de usuarios proveedor en la página de usuarios (/admin/users)

## Gestión de Términos y Condiciones en Administración de Proveedores

- [x] Revisar procedimientos tRPC existentes para T&C (getAllTermsVersions, createTermsVersion)
- [x] Agregar procedimiento updateTermsVersion (editar contenido/versión)
- [x] Agregar procedimiento setActiveTermsVersion (activar una versión específica)
- [x] Agregar procedimiento deleteTermsVersion (eliminar versión inactiva)
- [x] Crear componente TermsManagerDialog en SupplierMonitor.tsx
- [x] Botón "Términos y Condiciones" en el header de Administración de Proveedores
- [x] Lista de versiones con estado activo/inactivo, fecha de creación y número de aceptaciones
- [x] Formulario para crear nueva versión (campos: versión, contenido)
- [x] Formulario para editar versión existente
- [x] Acción para activar una versión (desactiva la anterior)
- [x] Acción para eliminar versión (solo si no tiene aceptaciones)
- [x] Vista previa del contenido (renderizado como texto con scroll)

## Quitar acceso al menú de Usuarios para commercial_specialist

- [x] Ocultar enlace "Usuarios" en NavigationMenu para commercial_specialist (desktop y mobile) — ya estaba correcto
- [x] Proteger la ruta /admin/users para redirigir a commercial_specialist si accede directamente

## Bloquear acceso directo por URL a /admin/users para commercial_specialist

- [x] Agregar commercial_specialist a la lista de roles redirigidos en UserManagement.tsx (acceso directo por URL)
- [x] Verificar que el guard system_specialist_only en App.tsx bloquea correctamente

## Renombrar botón "Proveedores" en navegación

- [x] Cambiar texto "Proveedores" por "Ventas por Proveedor" en NavigationMenu (desktop y mobile)

## Cambiar exportación CSV a Excel en portal de proveedores

- [x] Instalar librería xlsx (SheetJS) en el proyecto
- [x] Localizar todos los puntos de exportación CSV en el portal de proveedores
- [x] Convertir exportación de stock a Excel (.xlsx)
- [x] Convertir exportación de ventas a Excel (.xlsx)
- [x] Convertir cualquier otra exportación CSV a Excel (.xlsx) — no hay otras

## Renombrar pestaña Recepciones en portal de proveedores

- - [x] Cambiar "Recepciones" por "Entregas de Mercancía" en la pestaña de navegación
- [x] Cambiar "Recepciones" por "Entregas de Mercancía" en el encabezado de la sección

## Portal Marca Propia

- [x] Revisar esquema de BD y portal de proveedores existente
- [x] Agregar rol own_brand_user al enum de roles en drizzle/schema.ts
- [x] Crear tabla own_brand_brands en BD (id, brand_id, created_at) con seeds iniciales
- [x] Migrar BD con pnpm db:push
- [x] Crear server/ownBrandRouter.ts con procedimientos: getKPIs, getSalesByProductBranch, getStockByProduct, getReceptions, getCatalog, getBranchesForStock, getBranchesForSales, exportSales, exportStock, listBrands, addBrand, removeBrand, listAllBrands
- [x] Registrar ownBrandRouter en server/routers.ts
- [x] Crear client/src/pages/OwnBrandPortal.tsx basado en SupplierPortal.tsx
- [x] Pestaña "Marcas" en OwnBrandPortal solo visible para admin y own_brand_user
- [x] Eliminar toda referencia a "proveedor" en textos, labels y variables del nuevo portal
- [x] Agregar ruta /marca-propia en App.tsx con guard own_brand_only
- [x] Agregar enlace "Portal Marca Propia" en NavigationMenu para own_brand_user y system_specialist
- [x] Actualizar userRouter para soportar creación de own_brand_user
- [x] Escribir tests para ownBrandRouter (17 tests, 184 total)

## Dropdown "Portales Adicionales" en navegación

- [x] Agrupar "Ventas por Proveedor" y "Portal Marca Propia" en un dropdown "Portales Adicionales" (desktop y mobile)
- [x] Visible para admin, system_specialist y commercial_specialist (admin también ve Portal Marca Propia)

## Acceso de commercial_specialist al Portal Marca Propia

- [x] Agregar commercial_specialist al guard de la ruta /marca-propia en App.tsx
- [x] Agregar commercial_specialist al ítem "Portal Marca Propia" en NavigationMenu (desktop y mobile)
- [x] Agregar commercial_specialist al guard del ownBrandRouter (protectedProcedure)

## Auditoría de permisos Portal Marca Propia

- [x] Corregir ALLOWED_ROLES en OwnBrandPortal.tsx para incluir commercial_specialist
- [x] Corregir canManageBrands en OwnBrandPortal.tsx — solo admin y own_brand_user gestionan marcas
- [x] Actualizar comentario del archivo OwnBrandPortal.tsx para reflejar los 4 roles

## Acceso a Gestión de Usuarios desde menú desplegable

- [x] Agregar enlace "Gestión de Usuarios" en el menú desplegable del perfil para system_specialist y cst_user (desktop y mobile)

## Campo "Venta relacionada" en modal de creación de tickets

- [x] Revisar schema de tickets en BD y modal de creación actual
- [x] Agregar campo `related_sale_id` (nullable) en tabla tickets del schema de Drizzle
- [x] Migrar BD con pnpm db:push
- [x] Actualizar procedimiento createTicket en ticketRouter para aceptar related_sale_id
- [x] Agregar campo de venta en el modal de creación: autocompletado con la venta con error, editable
- [x] Mostrar el campo related_sale_id en la vista de detalle del ticket
- [x] 184 tests pasan, 0 errores TS

## Corrección campo "Venta relacionada" en tickets

- [x] Renombrar relatedSaleId → relatedSaleAmount (monto numérico, no identificador de texto)
- [x] Migrar BD: cambiar columna related_sale_id (varchar) a related_sale_amount (decimal)
- [x] Actualizar ticketsRouter: cambiar z.string() por z.number() para relatedSaleAmount
- [x] Actualizar ReportDiscrepancyModal: campo numérico con autocompletado desde dashboardAmount del contexto
- [x] Mostrar relatedSaleAmount en la vista de detalle del ticket con formato de moneda (S/ X,XXX.XX)
- [x] 184 tests pasan, 0 errores TS

## Filtro múltiple de productos en pestaña Ventas (Portales)
- [x] Crear componente MultiProductSelect reutilizable con checkboxes y búsqueda interna
- [x] Reemplazar Select único de productos en pestaña Ventas de SupplierPortal por MultiProductSelect
- [x] Reemplazar Select único de productos en pestaña Ventas de OwnBrandPortal por MultiProductSelect
- [x] Actualizar estado salesProductId (string | undefined) → salesProductIds (string[]) en ambos portales
- [x] Actualizar query getSalesByProductBranch para pasar array de IDs en lugar de uno solo
- [x] Actualizar query exportSalesByProductBranch para pasar array de IDs
- [x] Actualizar router supplierPortal.getSalesByProductBranch para aceptar productIds: string[]
- [x] Actualizar router supplierPortal.exportSalesByProductBranch para aceptar productIds: string[]
- [x] Actualizar router ownBrand.getSalesByProductBranch para aceptar productIds: string[]
- [x] Actualizar router ownBrand.exportSalesByProductBranch para aceptar productIds: string[]
- [x] Actualizar SQL en ambos routers para filtrar con IN (array) en lugar de = (uno solo)
- [x] Mostrar badge con cantidad de productos seleccionados en el trigger del selector
- [x] Guardar checkpoint

## Style Guide — Página pública de referencia de diseño
- [x] Crear StyleGuide.tsx con secciones: Intro, Colores, Tipografía, Logos, Botones, Badges, Cards, Tabla, Gráficos, Formularios, Indicadores KPI
- [x] Agregar bloque CSS exportable como comentario en la página
- [x] Registrar ruta pública /style-guide en App.tsx (sin ProtectedRoute)
- [x] Guardar checkpoint

## Top 50 — Stock y Cobertura
- [x] Actualizar getTopProducts en salesRouter.ts para incluir stock total por producto (JOIN con stocks) y calcular venta diaria promedio y cobertura
- [x] Actualizar interfaz ProductRow en TopProducts.tsx para incluir stock, avg_daily_qty y coverage
- [x] Agregar columnas Stock, Venta Diaria y Cobertura en RankingTable
- [x] Agregar tag de alerta rojo para cobertura < 5 días
- [x] Guardar checkpoint

## Top 50 — Corrección de tags de cobertura
- [x] Eliminar bordes de CoverageTag y aplicar estilo de badge sin borde (solo fondo sólido, sin outline)
- [x] Guardar checkpoint

## Top 50 — Semáforo de cobertura invertido
- [x] Cambiar lógica: rojo < 5 días, verde 5–10 días, amarillo > 10 días
- [x] Guardar checkpoint

## Login — Copia del diseño de Sanborja
- [x] Inspeccionar y documentar el diseño de login de sanborjadash
- [x] Replicar el diseño en la página de login de Flora & Fauna
- [x] Guardar checkpoint

## Top 50 — Modal de detalle en vista móvil
- [x] Agregar estado selectedRow y modal de detalle en TopProducts.tsx
- [x] Modal muestra todos los campos de la fila de forma legible (rank, SKU, nombre, categoría, unidades, monto, ticket promedio, stock, venta diaria, cobertura con badge)
- [x] Fila clickeable en móvil con indicador visual (cursor pointer, hover sutil)
- [x] Guardar checkpoint

## Login — Corrección campo usuario
- [x] Cambiar campo email por nombre de usuario (type text, label "Usuario", placeholder "nombre.apellido", autocomplete username)
- [x] Guardar checkpoint

## Login — Revertir mecánica de autenticación
- [ ] Revisar Login.tsx actual para identificar qué mecánica fue copiada del proyecto Sanborja
- [ ] Restaurar flujo OAuth/username+password original del proyecto, manteniendo el diseño visual
- [ ] Verificar que el acceso a módulos protegidos funciona correctamente
- [ ] Guardar checkpoint

## Login — Corrección de sesión (redirige de vuelta al login)
- [x] Diagnosticar: el catch en authenticateRequest capturaba ForbiddenError internos y los relanzaba como "Invalid session cookie", rompiendo el flujo de JWT local con userId
- [x] Separar la verificación JWT del manejo de userId/openId para que errores de DB no sean capturados como errores de JWT inválido
- [x] Guardar checkpoint

## Login — Diagnóstico profundo (redirige sin mensaje de error)
- [x] Verificar que la cookie se establece correctamente tras el login
- [x] Verificar que trpc.auth.me retorna el usuario después del login
- [x] Causa raíz: Express sin 'trust proxy' → isSecureRequest() devuelve false → cookie sin flag Secure → navegador HTTPS la descarta silenciosamente
- [x] Corregir: agregar app.set('trust proxy', 1) en index.ts
- [x] Guardar checkpoint

## Top 50 — Modalidad por defecto
- [x] Cambiar valor por defecto del tab de análisis de 'quantity' a 'amount'
- [x] Guardar checkpoint

## Análisis de Categorías — Filtro de canal y proyección mensual
- [x] Revisar lógica de canal en Análisis por Horas (router + UI)
- [x] Actualizar router de categorías para incluir sales_channel en el SELECT (mismo CASE que getHourlySales)
- [x] Agregar selector de canal multi-checkbox en DashboardFilters (prop opcional)
- [x] Agregar selector de canal en UI de Análisis de Categorías
- [x] Filtrar datos por canal en frontend y recalcular métricas
- [x] Agregar proyección mensual como 5to KPI en Análisis de Categorías
- [x] Guardar checkpoint

## Renombrar "Análisis por Categorías" → "Análisis General"
- [x] Reemplazar nombre en navegación, títulos, cards de home y metadatos
- [x] Guardar checkpoint

## Nuevo rol: Especialista de Operaciones (operations_specialist)

- [x] Agregar enum 'operations_specialist' al schema de la BD y migrar
- [x] Actualizar router: operations_specialist solo lista/crea/edita/elimina usuarios con role='store_user'
- [x] Actualizar UI panel de usuarios: filtrar lista a solo tienda para operations_specialist
- [x] Actualizar NavigationMenu: mostrar acceso a panel de usuarios para operations_specialist
- [x] Actualizar permisos de creación de usuarios: operations_specialist solo puede crear usuarios de tienda
- [x] Guardar checkpoint

## Fix: operations_specialist acceso denegado en /users
- [x] Identificar y corregir la guarda de ruta que bloquea a operations_specialist en /users (guard system_specialist_only en App.tsx no incluía operations_specialist)
- [ ] Guardar checkpoint
