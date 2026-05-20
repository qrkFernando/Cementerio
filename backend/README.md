# Backend — Plan de refactor por dominios (Opción A)

> Objetivo: reorganizar el código del backend **por dominios** (no por roles) sin romper nada.
>
> Estado actual (funciona): los archivos de rutas concentran mucha lógica y hay mezcla de rutas por rol dentro de un mismo router (por ejemplo, endpoints `/admin/*` viviendo dentro del módulo `cemetery`).
>
> Regla de oro durante este refactor: **ningún endpoint cambia su path, método HTTP, payload ni response**.

---

## Principios (nivel senior)

1. **Compatibilidad hacia atrás (API contract first)**
   - Se mantienen exactamente los mismos endpoints (paths/métodos) que hoy consume el frontend.
   - Si se reorganiza código interno, se hace detrás de los mismos routers/mount points.

2. **Separación de responsabilidades**
   - `routes` = declaración de endpoints + middlewares.
   - `controllers` = validación/normalización de input + responses.
   - `services` = reglas de negocio.
   - `repositories/queries` = acceso a DB y SQL.

3. **Refactor incremental, sin “big bang”**
   - Se extrae dominio por dominio.
   - En cada fase el backend debe seguir corriendo con `npm run dev`.

4. **Un dominio puede servir a múltiples roles**
   - El rol se controla con `requireRole/requirePermission` (middleware).
   - El módulo se nombra por el *qué* (reservas/pagos/tumbas), no por el *quién* (admin/cliente).

---

## Inventario de endpoints actuales (NO CAMBIAR)

> Nota: los prefijos actuales se preservan porque el frontend y la documentación ya los usan.

### Prefijo `/api/auth` (auth)
- `POST /api/auth/login`
- `POST /api/auth/request-code`
- `POST /api/auth/verify-code`
- `POST /api/auth/register`
- `POST /api/auth/verify-email`
- `GET  /api/auth/me`
- `POST /api/auth/logout`

### Prefijo `/api/admin` (hoy centralizado en `admin.routes.js`)
- `POST  /api/admin/users/role`
- `POST  /api/admin/employees`
- `GET   /api/admin/employees`
- `POST  /api/admin/clients`

- `GET   /api/admin/deceased`
- `POST  /api/admin/deceased`
- `POST  /api/admin/burials`

- `GET   /api/admin/payment-types`
- `GET   /api/admin/reservations`
- `POST  /api/admin/reservations`
- `PATCH /api/admin/reservations/:id`

- `GET   /api/admin/payments`
- `POST  /api/admin/payments`
- `PATCH /api/admin/payments/:id`

### Prefijo `/api/*` (hoy en `cemetery.routes.js`)
- `GET  /api/search`
- `GET  /api/payment-types`

Cliente (autenticado o público según endpoint):
- `GET  /api/client/profile`
- `PUT  /api/client/profile`
- `POST /api/client/reservations`
- `GET  /api/client/reservations/payment-summary`
- `GET  /api/client/reservations`
- `GET  /api/client/payments`
- `POST /api/client/payments`

Público:
- `GET  /api/client/available-graves`
- `GET  /api/client/grave-map`

Admin/Employee (ojo: hoy viven dentro del router `cemetery`):
- `GET  /api/admin/sectors`
- `POST /api/admin/sectors`
- `POST /api/admin/sectors/:sectorId/grid`
- `GET  /api/admin/grave-map`
- `GET  /api/admin/grave-types`
- `GET  /api/admin/graves`
- `POST /api/admin/graves`
- `PATCH /api/admin/graves/:id`

Employee:
- `POST /api/employee/burials`

---

## Dolor actual (por qué refactorizar)

- **Archivos de rutas enormes**: mucha lógica (SQL + transacciones + validación) vive en `*.routes.js`.
- **Dominio mezclado con rol**: endpoints `/api/admin/*` y `/api/employee/*` están implementados en `cemetery.routes.js`, mientras que otros `/api/admin/*` están en `admin.routes.js`.
- **Duplicación**: ejemplos típicos son normalizadores (`normalizeEmail`, `normalizeQuery`) repetidos en varios routers.

---

## Estructura objetivo (por dominios)

> Importante: esto describe **organización interna**. Los paths públicos no cambian.

Propuesta:

```
backend/src/
  app.js
  server.js
  middleware/
    auth.js
  infrastructure/
    db.js
    mailer.js
  shared/
    normalize.js
    httpErrors.js
  modules/
    auth/
      auth.routes.js
      auth.controller.js
      auth.service.js
      auth.repo.js

    users/
      users.repo.js

    employees/
      employees.controller.js
      employees.repo.js

    clients/
      clients.controller.js
      clients.repo.js

    deceased/
      deceased.controller.js
      deceased.repo.js

    burials/
      burials.controller.js
      burials.repo.js

    graves/
      graves.controller.js
      graves.repo.js

    sectors/
      sectors.controller.js
      sectors.repo.js

    reservations/
      reservations.controller.js
      reservations.repo.js

    payments/
      payments.controller.js
      payments.repo.js

  routes/
    admin.routes.js   # agregador: monta handlers de dominios bajo /api/admin
    api.routes.js     # agregador: monta handlers bajo /api (search, client, public)
```

### Qué significa “agregador”
- `routes/admin.routes.js` **no** es “módulo admin”.
- Es solo un router que **agrupa** endpoints con prefijo `/api/admin` pero delega a controllers de dominios.

Ejemplo mental:
- `GET /api/admin/graves` -> `graves.controller.listGravesAdmin()`
- `POST /api/client/reservations` -> `reservations.controller.createClientReservation()`

---

## Plan por fases (seguro, incremental)

### Fase 0 — Preparación (sin cambios funcionales)
**Objetivo:** habilitar refactor sin riesgo.
- Crear `backend/src/shared/normalize.js` (email/query, etc.) y usarlo primero en 1–2 endpoints (cambio mecánico).
- Añadir un “smoke checklist” manual (ver sección Validación).

**Criterio de salida:** backend corre y endpoints principales responden igual.

### Fase 1 — Extraer dominio `graves + sectors` desde `cemetery.routes.js`
**Por qué primero:** tiene endpoints claramente dominiales y es donde hoy hay mezcla `/api/admin/*`.

Movimiento propuesto:
- Desde `modules/cemetery/cemetery.routes.js` extraer:
  - `GET/POST /api/admin/sectors`
  - `POST /api/admin/sectors/:sectorId/grid`
  - `GET /api/admin/grave-map`
  - `GET /api/admin/grave-types`
  - `GET/POST/PATCH /api/admin/graves`
  - y endpoints públicos de mapa/disponibles si corresponden al mismo dominio.

Cómo evitar romper:
- Mantener `buildCemeteryRouter()` temporalmente como “compat layer” que solo haga `router.use(...)` hacia nuevos routers internos.
- No tocar el SQL todavía: solo moverlo a `*.repo.js` sin modificar queries.

**Criterio de salida:** UI admin de tumbas/sectores funciona igual.

### Fase 2 — Extraer dominio `reservations`
Movimiento:
- Extraer `POST/GET /api/client/reservations` y `GET /api/client/reservations/payment-summary`.
- Extraer `/api/admin/reservations*` hoy en `modules/admin/admin.routes.js` hacia `modules/reservations/*`.

Estado:
- ✅ Cliente ya extraído a `modules/reservations/reservations.client.routes.js` y montado desde `modules/cemetery/cemetery.routes.js`.
- ✅ Admin ya extraído a `modules/reservations/reservations.admin.routes.js` y montado desde `modules/admin/admin.routes.js`.

Cómo evitar romper:
- Mantener `buildAdminRouter()` pero reemplazar internamente handlers por llamadas a `reservations.controller`.

**Criterio de salida:** cliente puede reservar y admin puede confirmar/rechazar igual.

### Fase 3 — Extraer dominio `payments`
Movimiento:
- Extraer `/api/client/payments` y `/api/admin/payments*`.
- Mantener `ensurePaymentTypes()` en un lugar único (ideal: `payments.service.js` o `paymentTypes.repo.js`) y reusar.

Estado:
- ✅ Cliente ya extraído a `modules/payments/payments.client.routes.js` y montado desde `modules/cemetery/cemetery.routes.js`.
- ✅ Admin ya extraído a `modules/payments/payments.admin.routes.js` y montado desde `modules/admin/admin.routes.js`.

**Criterio de salida:** pagos cliente y admin iguales.

### Fase 4 — Extraer `deceased + burials`
Movimiento:
- Extraer `GET/POST /api/admin/deceased`, `POST /api/admin/burials`, `POST /api/employee/burials`.

Estado:
- ✅ Admin ya extraído a `modules/deceased/deceased.admin.routes.js` y `modules/burials/burials.admin.routes.js` (montados desde `modules/admin/admin.routes.js`).
- ✅ Employee ya extraído a `modules/burials/burials.employee.routes.js` (montado desde `modules/cemetery/cemetery.routes.js`).

**Criterio de salida:** registros y entierros iguales.

### Fase 5 — Limpieza final (eliminar `cemetery` como “cajón de sastre”)
- `modules/cemetery/` deja de existir o queda como “public api aggregator” (idealmente se elimina).
- `app.js` monta:
  - `/api/auth` -> auth
  - `/api/admin` -> `routes/admin.routes.js`
  - `/api` -> `routes/api.routes.js`

---

## Matriz “qué se mueve” (resumen)

- `modules/cemetery/cemetery.routes.js`
  - Se divide en: `graves/`, `sectors/`, `reservations/`, `payments/`, `clients/` (perfil), y un `routes/api.routes.js`.

- `modules/admin/admin.routes.js`
  - Se transforma en un agregador (o se reemplaza por `routes/admin.routes.js`) que delega a dominios.
  - Endpoints `/users/role`, `/employees`, `/clients` quedarán en dominios `users/employees/clients`.

- `modules/auth/*`
  - Se mantiene como dominio `auth` (ya está bien encaminado).

---

## Validación (para asegurar “sigue funcionando”)

### Smoke checklist (manual)
1. `GET /health` y `GET /api/health/db`.
2. Login y `GET /api/auth/me`.
3. Cliente:
   - `GET /api/client/profile`
   - `GET /api/client/available-graves`
   - `POST /api/client/reservations`
   - `GET /api/client/reservations`
   - `POST /api/client/payments`
4. Admin/Employee (según permisos):
   - `GET /api/admin/graves`
   - `PATCH /api/admin/graves/:id`
   - `GET /api/admin/reservations`
   - `PATCH /api/admin/reservations/:id`
   - `GET /api/admin/payments`

### Reglas anti-regresión
- No cambiar nombres de campos (ej. `ok`, `error`, `items`, etc.).
- No cambiar códigos HTTP (400/401/403/409/500).
- Mantener la lógica de transacciones exactamente igual; solo moverla a `repo/service`.

---

## Rollback strategy

- Cada fase se puede revertir porque:
  - Los endpoints siguen iguales.
  - Los agregadores mantienen el wiring.
  - Los cambios son principalmente “mover código + imports”.

Recomendación práctica:
- Ejecutar el plan fase a fase, y al final de cada fase hacer una corrida rápida del smoke checklist.

---

## Notas de implementación (para cuando empecemos)

- Evitar crear “framework” propio. Mantener Express simple.
- Si se necesita validación más formal, hacerlo incremental (por ahora basta con los checks actuales).
- Centralizar normalizadores y helpers en `shared/`.
