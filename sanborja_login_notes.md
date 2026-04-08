# Notas de diseño — Login Sanborja

## Layout
- Split screen: panel izquierdo oscuro (~50% ancho) + panel derecho claro (~50% ancho)
- Panel izquierdo: fondo muy oscuro (casi negro, ~#232523 o similar), centrado verticalmente
  - Logo/nombre "FLORA & FAUNA" en tipografía serif grande, color blanco/crema
  - Subtítulo "Dashboard de Análisis de Rentabilidad" en texto pequeño gris claro
  - Nombre de tienda "Tienda San Borja" en texto pequeño, ligeramente más prominente
- Panel derecho: fondo off-white/bone (#F5F4F1 o similar), centrado verticalmente
  - Título "INICIAR SESIÓN" en mayúsculas, tipografía bold, color oscuro
  - Subtítulo "Acceso restringido · Solo personal autorizado" en gris pequeño
  - Formulario con campos: Correo electrónico + Contraseña
  - Labels en mayúsculas pequeñas (text-xs uppercase tracking-wide)
  - Inputs con fondo blanco/gris muy claro, sin bordes prominentes
  - Botón "Ingresar" negro/grafito, ancho completo, texto blanco

## Colores observados
- Panel izquierdo bg: ~#232523 (grafito oscuro)
- Panel derecho bg: ~#F5F4F1 (bone/off-white)
- Texto izquierdo: blanco/crema
- Botón: negro/grafito oscuro (#232523)
- Labels: gris oscuro uppercase

## Tipografía
- Logo: serif (posiblemente la misma tipografía del proyecto)
- Títulos: Italian Plate No 1 o similar bold uppercase
- Cuerpo/labels: Sailec

## Formulario
- Campo email con placeholder "correo@ejemplo.com"
- Campo password con toggle de visibilidad (ojo)
- Botón "Ingresar" full-width
