# Trial de proveedores y sugerencias de mejora

**Autor:** Manus AI  
**Fecha:** 3 de septiembre de 2026  
**Estado:** implementación lista para publicar; la creación del aviso programado se realiza después de desplegar esta versión.

## Actualizaciones realizadas

El ciclo de trial de proveedores conserva sus flujos actuales de activación, términos, vencimiento, solicitud de acceso facturado y aprobación. El aviso de vencimiento que antes dependía de un temporizador dentro del proceso fue sustituido por un callback HTTP programado y persistente. Este callback solo admite una identidad de tarea programada, valida su `task_uid` contra la configuración guardada y registra cada entrega con una clave única por proveedor y fecha de vencimiento. Así, un reintento de la plataforma no reenvía el mismo correo.

El aviso se configurará para ejecutarse todos los días a las **09:00, hora de Lima** (`0 0 14 * * *` en UTC). Selecciona proveedores con `trial_active` cuyo fin de trial ocurre en dos días. El correo se procesa individualmente y los destinatarios no quedan expuestos entre sí.

También se reforzó el cambio administrativo de contraseña. La nueva contraseña debe tener al menos doce caracteres e incluir mayúscula, minúscula y número; debe confirmarse antes del envío y no puede ser igual a la anterior. El aviso por correo queda desmarcado inicialmente y, cuando se autoriza, solo comunica la actualización de seguridad y el acceso al dashboard: **no incluye contraseñas ni credenciales en texto plano**.

## Activación pendiente tras la publicación

Después de publicar el checkpoint, se creará una única tarea administrada con los siguientes valores:

| Parámetro | Valor |
|---|---|
| Nombre | `supplier-trial-expiry-alert-v1` |
| Frecuencia | Diaria, 09:00 (America/Lima) |
| Expresión UTC | `0 0 14 * * *` |
| Callback | `/api/scheduled/supplier-trial-expiry-alert` |
| Autenticación | Identidad cron de la plataforma; validación por `task_uid` persistido |
| Idempotencia | Una entrega por proveedor y fecha de vencimiento |
| Gestión operativa | Panel de Schedules: historial, pausar, reanudar, editar y ejecutar bajo demanda |

> La tarea no debe crearse en desarrollo. El callback necesita estar disponible en el dominio de producción para que la plataforma pueda ejecutarlo de forma persistente.

## Sugerencias priorizadas

| Prioridad | Sugerencia | Beneficio esperado | Alcance recomendado |
|---|---|---|---|
| Alta | Añadir un enlace de restablecimiento con token de un solo uso para autoservicio de contraseña. | Elimina la entrega de claves por canales externos y permite que el usuario defina su propia contraseña. | Nuevo propósito de token, expiración, invalidación y página pública de restablecimiento. |
| Alta | Exponer en el monitor de proveedores el estado del aviso diario y su última ejecución. | Permite confirmar rápidamente si la automatización quedó activa y detectar errores operativos. | Consulta de configuración y registro de entregas, solo para especialistas. |
| Media | Registrar los cambios administrativos de contraseña en una auditoría sin guardar la contraseña. | Aporta trazabilidad de quién cambió la clave, cuándo y si se solicitó aviso. | Tabla de auditoría y consulta protegida para Especialista de Sistemas. |
| Media | Incorporar una vista de entregabilidad de Brevo para avisos críticos. | Facilita detectar rebotes, correos inválidos y campañas con incidencias. | Sincronización o consulta de eventos de entrega del proveedor de correo. |
| Media | Consolidar el resolvedor de URL pública en todos los correos transaccionales. | Evita enlaces a dominios obsoletos en activaciones, cambios de contraseña y notificaciones. | Reemplazo progresivo de URLs fijas por la validación del host publicado. |
| Baja | Añadir métricas de conversión del trial: activados, vencidos, solicitudes y suscripciones. | Da visibilidad comercial al embudo de proveedores. | Tarjetas de resumen y filtros de período en el monitor y reporte de afiliación. |
| Baja | Agregar una fecha programada de reintento supervisado para alertas fallidas. | Permite recuperar fallas de proveedor de correo sin riesgo de duplicados. | Acción manual o tarea separada que procese únicamente entregas `failed`. |

## Validación aplicada

Las pruebas del aviso diario verifican la expresión de programación, la ventana de dos días y la clave idempotente. Las pruebas del módulo de usuarios cubren el cambio de contraseña con confirmación. La validación se ejecutó sin enviar correos reales.
