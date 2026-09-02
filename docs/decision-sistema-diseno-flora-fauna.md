# Decisión de interfaz: sistema de diseño Flora & Fauna

## Alcance aplicado

El dashboard adopta una base visual común de Flora & Fauna: superficies papel y crema, texto y acciones principales en ink, acentos funcionales restringidos a oro, verde y granate, bordes cálidos de bajo contraste y controles rectangulares. Las tarjetas, botones, campos, selectores, menús y diálogos comparten este tratamiento mediante primitivas reutilizables.

La página de inicio, la navegación global y el portal de Marca Propia utilizan una jerarquía editorial con cejas en mayúsculas, títulos en sentence case, reglas tipo ledger y espaciado generoso. Se preservaron rutas, permisos y contratos de datos.

## Accesibilidad y responsive

Se incorporó un foco visible común, se respetan preferencias de movimiento reducido y se validó la composición de la navegación, portada, filtros y portal de Marca Propia en escritorio y en una vista móvil de 375 px. Las acciones importantes mantienen etiquetas textuales y las tarjetas de módulos tienen nombres accesibles.

## Excepción documentada

El proyecto utiliza actualmente la fuente corporativa local `Italian Plate No 1` junto con Sailec. La referencia oficial indica Italian Plate No2 para display; no se sustituyó la fuente porque la variante No2 no está disponible en los activos desplegados del proyecto. Cuando se incorpore el activo corporativo aprobado, se deberá reemplazar únicamente la declaración `--font-heading` en los estilos globales.
