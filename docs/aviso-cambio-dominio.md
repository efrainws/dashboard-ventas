# Aviso de cambio de dominio

## Propósito y control operativo

El aviso comunica a los usuarios la URL HTTPS publicada vigente del Dashboard de Ventas. Se activa manualmente desde **Administración de Usuarios** y únicamente está disponible para `system_specialist`.

El flujo es obligatorio: **previsualización → prueba al especialista que ejecuta la acción → confirmación explícita → envío masivo**. No hay ejecución programada ni envío automático.

| Campo | Valor / regla |
|---|---|
| Nombre interno | `domain-change-notice` |
| Asunto | `Actualización de acceso al Dashboard de Ventas` |
| Remitente | `Flora & Fauna · Notificaciones <notificaciones@florayfauna.pe>` |
| Reply-to | `Soporte Flora & Fauna <soporte@florayfauna.pe>` |
| Idioma | Español de Perú |
| Adjuntos | No aplica |
| Prueba | Se envía solo al correo válido del `system_specialist` que abrió el flujo; el asunto recibe el prefijo `[PRUEBA]` |

## Mapeo de variables y destinatarios

| Variable | Descripción | Origen backend | Obligatoria | Alternativa / bloqueo |
|---|---|---|---|---|
| `publicUrl` | URL de acceso incluida en el botón y texto | `x-forwarded-host` + `x-forwarded-proto` de la solicitud tRPC, validada como host HTTPS público | Sí | Se bloquea en localhost, IPs y dominios de desarrollo `*.manus.computer` |
| `recipientName` | Saludo personalizado | `users.name` | No | `usuario` |
| `recipientEmail` | Destinatario individual | `users.email`, normalizado y validado | Sí | El registro se excluye del envío |
| `sender` | Identidad del aviso | Constante de backend | Sí | No aplica |
| `subject` | Asunto del mensaje | Constante de backend | Sí | No aplica |

La interfaz no recibe ni envía direcciones de correo ni URL como parámetros de la operación. El backend resuelve los destinatarios desde la tabla local `users` y solo considera direcciones con formato válido.

## Auditoría e idempotencia

Cada URL publicada genera una campaña identificada por `SHA-256("domain-change:" + publicUrl)`. La tabla `domain_change_campaigns` registra el creador, prueba, destinatario de prueba, fecha, conteos y resultado. La tabla `domain_change_email_deliveries` registra el estado de cada usuario.

> Una campaña no puede llegar a envío masivo sin estado `tested` y sin que la prueba haya sido realizada por el mismo `system_specialist` que confirma la acción.

Los estados de campaña son `draft`, `tested`, `sending`, `sent`, `partial` y `failed`. Los estados de entrega son `pending`, `sending`, `sent` y `failed`. El estado `sending` se registra antes de llamar al proveedor para reducir el riesgo de reintentos duplicados.

## Previsualización y seguridad

La previsualización construye el mismo HTML y texto plano que el envío real sin llamar a Brevo. La interfaz muestra un `iframe` con `sandbox` vacío en vista de escritorio y móvil, por lo que no ejecuta scripts ni contenido activo.

No se muestran listas de destinatarios ni datos personales de otros usuarios en la interfaz. La única dirección expuesta durante la prueba es la del especialista autenticado que la recibe.
