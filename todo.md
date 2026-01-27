# Project TODO

## Completadas ✅
- [x] Conexión a base de datos PostgreSQL de producción
- [x] Conversión de scripts QlikSense a Python
- [x] Dashboard web interactivo con filtros
- [x] Filtros por Sucursal, Fecha y Método de Pago
- [x] Filtros avanzados de Año y Año-Mes
- [x] Vista inicial de última semana por defecto
- [x] Sistema de login simple
- [x] Gestión de usuarios con roles (Admin/Visualizador)
- [x] Control de acceso basado en roles
- [x] Migrar autenticación a base de datos
- [x] Crear tabla de usuarios en la base de datos (extendida con username y password)
- [x] Implementar endpoints de API para login (tRPC auth.login)
- [x] Conectar frontend a API de autenticación (Login.tsx actualizado)
- [x] Hashear contraseñas con bcrypt
- [x] Sembrar usuarios iniciales en la base de datos (admin/admin123, user/user123)
- [x] Implementar endpoint de logout (tRPC auth.logout)
- [x] Modificar authenticateRequest para soportar JWT local y OAuth de Manus
- [x] Tests unitarios para endpoint de login (5 tests pasando)
- [x] Actualizar Home.tsx para usar useAuth del template
- [x] Actualizar App.tsx para eliminar AuthContext y usar protección con useAuth

## Pendientes ⏳
- [ ] Investigar y corregir problema de UI en el login (botón no responde en navegador)
- [ ] Verificar que la redirección después del login funcione correctamente
- [ ] Probar flujo completo de autenticación en el navegador
- [ ] Verificar que el logout funcione correctamente
- [ ] Documentar el nuevo flujo de autenticación en README
- [ ] Optimizar manejo de grandes volúmenes de datos con Python (según instrucciones del proyecto)

## Notas Técnicas

### Autenticación Implementada
- **Backend**: tRPC con procedimientos `auth.login`, `auth.logout`, `auth.me`
- **Base de Datos**: TiDB/MySQL con tabla `users` extendida (username, password hasheado con bcrypt)
- **JWT**: Tokens firmados con HS256, expiración de 7 días, almacenados en cookies HttpOnly
- **Cookies**: HttpOnly, Secure, SameSite=none, path=/
- **Roles**: admin (acceso completo) y user (restringido - sin tabla de transacciones)
- **Doble soporte**: JWT local (userId) y JWT de Manus OAuth (openId)

### Tests
- `server/auth.login.test.ts`: 5 tests pasando ✅
  - Login exitoso con credenciales correctas
  - Falla con contraseña incorrecta
  - Falla con usuario inexistente
  - Falla con username vacío
  - Falla con contraseña vacía

### Credenciales de Prueba
- Admin: `admin` / `admin123` (rol: admin)
- Usuario: `user` / `user123` (rol: user)

### Archivos Modificados
- `server/routers.ts`: Endpoint de login y logout
- `server/db.ts`: Funciones getUserByUsername, getUserById, updateUserLastSignIn
- `server/_core/sdk.ts`: authenticateRequest modificado para soportar JWT local y OAuth
- `client/src/pages/Login.tsx`: Usa tRPC en lugar de AuthContext
- `client/src/pages/Home.tsx`: Usa useAuth del template y tRPC para logout
- `client/src/App.tsx`: Eliminado AuthProvider, usa ProtectedRoute con useAuth
- `drizzle/schema.ts`: Tabla users extendida con username y password
- `server/auth.login.test.ts`: Tests unitarios para el endpoint de login

## Nueva Tarea - Depuración de Login UI
- [x] Identificar causa del problema del botón de login que no responde
- [x] Corregir el problema en el componente Login.tsx
- [x] Verificar que las peticiones tRPC se envíen correctamente
- [x] Simplificar componente Login para eliminar complejidad innecesaria
- [ ] Probar flujo completo de login en el navegador (requiere prueba manual)
- [ ] Verificar redirección después del login exitoso (requiere prueba manual)
