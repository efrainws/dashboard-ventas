# Decisión de interfaz: sistema de diseño Flora & Fauna

## Alcance aplicado

El dashboard adopta una base visual común de Flora & Fauna: superficies papel y crema, texto y acciones principales en ink, acentos funcionales restringidos a oro, verde y granate, bordes cálidos de bajo contraste y controles rectangulares. Las tarjetas, botones, campos, selectores, menús y diálogos comparten este tratamiento mediante primitivas reutilizables.

La página de inicio, la navegación global y el portal de Marca Propia utilizan una jerarquía editorial con cejas en mayúsculas, títulos en sentence case, reglas tipo ledger y espaciado generoso. Se preservaron rutas, permisos y contratos de datos.

## Accesibilidad y responsive

Se incorporó un foco visible común, se respetan preferencias de movimiento reducido y se validó la composición de la navegación, portada, filtros y portal de Marca Propia en escritorio y en una vista móvil de 375 px. Las acciones importantes mantienen etiquetas textuales y las tarjetas de módulos tienen nombres accesibles.

## Excepción documentada

El proyecto utiliza actualmente la fuente corporativa local `Italian Plate No 1` junto con Sailec. La referencia oficial indica Italian Plate No2 para display; no se sustituyó la fuente porque la variante No2 no está disponible en los activos desplegados del proyecto. Cuando se incorpore el activo corporativo aprobado, se deberá reemplazar únicamente la declaración `--font-heading` en los estilos globales.

## Variantes semánticas de cumplimiento y canal

Las superficies de **Ventas vs Meta** pueden representar estados que provienen de los datos operativos. Estas no constituyen excepciones visuales locales: están definidas en `index.css` como variantes reutilizables del sistema. La variante `ff-target-tone--complete` se usa desde 100% de cumplimiento, `--on-track` entre 90% y 99.9%, `--attention` entre 75% y 89.9%, `--critical` por debajo de 75% y `--not-set` cuando no existe una meta configurada. Las variantes de canal (`ff-channel-presencial`, `ff-channel-ecommerce`, `ff-channel-rappi` y `ff-channel-neutral`) se usan únicamente para identificar el origen comercial en filtros y etiquetas.

La única propiedad visual que puede provenir de los datos en esta familia es la anchura de una barra de progreso. El color, borde, espaciado, geometría, foco y superficie se resuelven siempre con tokens del sistema. Estas variantes pueden reutilizarse en futuros módulos con el mismo significado operativo; no deben emplearse para decorar contenido sin relación con canal o cumplimiento.
