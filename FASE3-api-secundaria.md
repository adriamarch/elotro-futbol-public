# FASE 3 — API secundaria PostgreSQL

## Estado

Implementación de la capa de compatibilidad PostgreSQL y exposición HTTP de la API secundaria completadas a nivel de código. La validación contra una base PostgreSQL/Railway real queda pendiente de disponer de `DATABASE_URL` y credenciales de infraestructura.

## Cambios realizados

### 1. Adaptador D1 → PostgreSQL

Se creó:

- `worker-secondary/src/postgres-db.js`

El adaptador expone la interfaz utilizada por el Worker existente:

- `prepare(sql)`
- `bind(...)`
- `first()`
- `all()`
- `run()`

Esto permite reutilizar la lógica de negocio de `src/index.js` sin copiar una segunda implementación de cada endpoint.

`run()` reproduce además el contrato de D1 usado por la aplicación:

- `meta.changes`
- `meta.last_row_id`

Los INSERT sobre tablas con `id` usan `RETURNING id` internamente para obtener el identificador generado de forma segura.

### 2. Compatibilidad SQL

Se creó:

- `worker-secondary/src/sql-compat.js`

Adapta automáticamente construcciones SQLite usadas por la API:

- `?` → `$1`, `$2`, ...
- `?1`, `?2`, ... → `$1`, `$2`, ...
- `datetime('now')` → `CURRENT_TIMESTAMP`
- `datetime('now', ?)` → `CURRENT_TIMESTAMP + $n::interval`
- `datetime('now', '+N minutes')`
- comparaciones de `programado_para` con el timestamp actual

### 3. Railway ahora ejecuta la API real

Se modificó:

- `worker-secondary/src/server-railway.js`

Ahora:

1. crea el pool PostgreSQL;
2. crea el adaptador compatible con D1;
3. construye el entorno desde variables de Railway;
4. conserva el handler completo existente de `src/index.js`;
5. enruta las peticiones HTTP hacia ese handler;
6. mantiene `/api/health` separado.

Variables utilizadas:

- `DATABASE_URL`
- `JWT_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_CLOUD_NAME`
- `PORT`

### 4. Esquema PostgreSQL corregido

Durante esta fase se detectó que el esquema inicial de Fase 2 no representaba todas las columnas reales del esquema D1 final. Se corrigió `001_initial_schema.sql` para reflejar el esquema final auditado, incluyendo:

- campos de perfil;
- traducciones;
- coautoría;
- programación;
- minuto a minuto;
- penaltis;
- MVP;
- solicitudes de edición;
- comentarios;
- alineaciones;
- actividad;
- niveles;
- multimedia;
- sesiones.

Esto evita trasladar a PostgreSQL un esquema simplificado que rompería endpoints existentes.

## Arquitectura resultante

```text
Frontend
   |
   v
Railway / server-railway.js
   |
   v
API original / src/index.js
   |
   v
D1-compatible DB adapter
   |
   v
PostgreSQL
```

La lógica de negocio sigue estando en un único `index.js`, en lugar de mantener dos copias funcionales divergentes.

## Tests realizados

- [x] `node --check` de `index.js`.
- [x] `node --check` de `server-railway.js`.
- [x] `node --check` del adaptador PostgreSQL.
- [x] `node --check` del traductor SQL.
- [x] Tests unitarios del traductor SQL.
- [x] Conversión de placeholders normales.
- [x] Conversión de placeholders numerados `?1`, `?2`.
- [x] Conversión de `datetime('now')`.
- [x] Conversión de intervalos.
- [x] Comparación de `programado_para`.
- [x] Comparación estática de rutas: las rutas literales del Worker y secundaria siguen coincidiendo.
- [x] Verificación de que `worker-secondary/src/index.js` conserva la misma implementación funcional que el Worker principal.

### Test que no se pudo ejecutar

No fue posible ejecutar el servidor Node de extremo a extremo porque el entorno de trabajo no dispone de `node_modules` y la instalación de dependencias no terminó dentro del tiempo disponible. Tampoco existe una `DATABASE_URL` PostgreSQL proporcionada para ejecutar integración real.

Por tanto, **no se declara todavía la Fase 3 como validada en producción**.

## Problemas encontrados durante la fase

1. El esquema PostgreSQL preparado inicialmente en Fase 2 era demasiado simplificado frente al `schema.sql` final y sus migraciones. Se corrigió antes de cerrar esta fase.
2. La API utiliza varias construcciones SQLite que no pueden enviarse directamente a PostgreSQL.
3. Railway anteriormente solo exponía `/api/health`.
4. Existen timestamps históricamente almacenados como texto; se mantiene el contrato para evitar una migración de datos prematura.
5. Las tareas `scheduled` del Worker todavía no están activadas en Railway. No se debe activar un scheduler secundario hasta resolver la coordinación para evitar doble ejecución.
6. La sincronización D1 ↔ PostgreSQL todavía no existe.

## Archivos modificados/creados

- `worker-secondary/src/postgres-db.js`
- `worker-secondary/src/sql-compat.js`
- `worker-secondary/src/server-railway.js`
- `worker-secondary/db/migrations/001_initial_schema.sql`
- `worker-secondary/verify-postgres-schema.mjs`
- `worker-secondary/package.json`
- `worker-secondary/test/postgres-db.test.mjs`
- `FASE3-api-secundaria.md`

## Criterio de cierre de Fase 3

La fase está **implementada, pero pendiente de validación de integración**.

Antes de pasar a Fase 4 se debe levantar PostgreSQL real y comprobar al menos:

- login;
- sesiones;
- artículos;
- comentarios;
- resultados;
- eventos de partido;
- alineaciones;
- multimedia/Cloudinary;
- perfiles;
- administración;
- traducciones;
- settings;
- solicitudes de edición.

También debe verificarse que las respuestas JSON mantienen el contrato del frontend.

## Siguiente paso

No iniciar todavía la sincronización bidireccional. Primero ejecutar una prueba de integración contra PostgreSQL real. Una vez superada, la Fase 4 debe definir la fuente de verdad y el mecanismo de sincronización/reconciliación.
