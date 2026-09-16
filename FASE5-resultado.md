# FASE 5 — Resultado final de implementación y validación local

## Estado

**FASE 5: máximo nivel alcanzable desde el ZIP — 85%.**

La implementación del failover está terminada y ha sido revisada directamente sobre el proyecto. Se han ampliado los tests automatizados para cubrir los casos de error HTTP, circuit breaker y recuperación estable.

No se marca como 100% porque la propia fase exige validación contra la infraestructura real: URL pública de Railway, health checks reales, autenticación real durante failover y una caída real de la primaria. Esos datos/acciones no están contenidos en el ZIP y no deben inventarse.

## Arquitectura

```text
Frontend
   |
   v
apiFetch()
   |
   +---- PRIMARY_API
   |       |
   |       +---- OK -> respuesta
   |       |
   |       +---- timeout / red / 502 / 503 / 504
   |                    |
   |                    v
   +---------------- SECONDARY_API
                        |
                        +---- OK -> respuesta
```

La primaria continúa siendo:

`https://elotrofutbol-api.adriamarch2010.workers.dev`

La secundaria se obtiene de `window.EOF_SECONDARY_API_URL`. No se inventa una URL de Railway inexistente en el proyecto.

## Validaciones realizadas directamente sobre el ZIP

### Centralización

- [x] Revisión de las llamadas API del frontend.
- [x] Las llamadas de aplicación encontradas utilizan `apiFetch()`/`apiAdminFetch()`.
- [x] No quedan llamadas `fetch()` directas a la API primaria en el frontend.
- [x] El `fetch()` restante detectado en `admin.js` descarga imágenes externas y no es una llamada a la API.
- [x] `PRIMARY_API` y `SECONDARY_API` están centralizadas en `public/js/config.js`.

### Failover

- [x] Timeout de 8 segundos.
- [x] Health check con máximo de 5 segundos.
- [x] Failover de GET/HEAD ante errores de transporte.
- [x] Failover ante 502/503/504.
- [x] 400/401/403/404 no provocan failover.
- [x] Las escrituras POST/PUT/DELETE no se repiten automáticamente.

### Circuit breaker

- [x] 3 fallos consecutivos abren el circuito.
- [x] Con circuito abierto, las lecturas utilizan la secundaria.
- [x] El circuito espera 30 segundos antes de volver a probar primaria.
- [x] Se requieren 2 respuestas positivas para cerrar el circuito y volver a PRIMARY.
- [x] Se evita el cambio continuo PRIMARY/SECONDARY.

### Health check

- [x] API primaria: `GET /api/health`.
- [x] API secundaria Railway: `GET /api/health`.
- [x] La primaria comprueba D1.
- [x] La secundaria comprueba PostgreSQL.
- [x] Un fallo de almacenamiento devuelve 503/degraded.

### Diagnóstico

- [x] `window.EOF_API_DEBUG()` disponible.
- [x] Estado de primaria/secundaria.
- [x] API activa.
- [x] Contador de fallos.
- [x] Último fallo/recuperación.
- [x] Estado del circuit breaker.
- [x] No se muestra de forma invasiva al usuario.

## Tests automatizados finales

**CORRECCIÓN (revisión posterior a la redacción original de esta fase):**
la afirmación original de "8/8 tests PASS" de esta sección era incorrecta
en el momento de revisarla: `worker-secondary/test/api-failover.test.mjs`
usaba nombres (`apiOrigin`, `API_FAILOVER_STATE`) que ya no existían en
`public/js/config.js` (que en algún momento posterior pasó a usar
`PRIMARY_API`/`SECONDARY_API`/`eofApiState`), así que los 7 tests de ese
archivo fallaban en bloque por referencia indefinida. El archivo se ha
reescrito para usar los nombres reales de `config.js` y se ha ampliado con
3 casos nuevos (login con failover, respeto de `X-Failover-Backend` del
failover server-side, POST con 502 sin reintento). Se ha añadido además
`sync/test/write-id-reconciliation.test.mjs` para cubrir la reconciliación
de filas huérfanas por `origin_write_id` (ver `FASE4-sincronizacion.md`,
sección de límites de `003_pending_writes.sql`).

Se ejecutó:

```
npm test --prefix worker-secondary        # test/*.test.mjs
npm run test:sync --prefix worker-secondary # sync/test/*.test.mjs
```

Resultado verificado en esta revisión:

- `npm test`: **11/11 tests PASS** (10 de failover del navegador + 1 de traducción SQL/adaptador PostgreSQL).
- `npm run test:sync`: **15/15 tests PASS**, 4 se saltan explícitamente por falta de `DATABASE_URL` (no se simulan, mismo criterio que el resto del proyecto).

Casos cubiertos en `test/api-failover.test.mjs` (10):

1. [x] Error de red en primaria -> secundaria.
2. [x] 401 -> no failover.
3. [x] 404 -> no failover.
4. [x] 502/503/504 -> secundaria.
5. [x] POST con error de red -> no duplicación/reintento.
6. [x] POST con 502 -> se devuelve tal cual, sin reintento.
7. [x] `POST /api/login` -> SÍ hace failover (no duplica datos de negocio).
8. [x] Tres fallos -> circuit breaker OPEN.
9. [x] Recuperación con 2 respuestas positivas -> PRIMARY.
10. [x] `X-Failover-Backend: RAILWAY` en una respuesta 200 de la primaria se refleja como SECONDARY en el diagnóstico del navegador.

Casos cubiertos en `sync/test/write-id-reconciliation.test.mjs` (6):

1. [x] Sin `origin_write_id` en la fila, no se toca nada.
2. [x] Fila huérfana con PK distinto al de D1 se elimina.
3. [x] Si el PK ya coincide (pasada anterior ya reconciliada), no se borra nada.
4. [x] Sin fila huérfana previa (no hubo failover para esa fila), no se hace nada.
5. [x] Si el `DELETE` de la huérfana falla (p. ej. una FK de otra tabla), se registra el conflicto en `sync_write_id_conflicts` y no se aborta el lote.
6. [x] Varias filas huérfanas para el mismo `write_id` (caso raro) se eliminan todas.

También se ejecutó comprobación sintáctica `node --check` sobre los JavaScript/MJS relevantes del proyecto (incluidos los archivos tocados en esta revisión): **sin errores**.

## Tests no ejecutables completamente en este entorno

El ZIP no contiene las dependencias instaladas de `worker-secondary`. Se intentó instalar mediante `npm ci --offline`, pero el entorno no tenía en caché todos los paquetes requeridos. Por ello no fue posible ejecutar el conjunto de tests de sincronización que requiere una conexión real (`DATABASE_URL`) y Wrangler con acceso a D1 remoto: la reconciliación por `origin_write_id` está probada a nivel de unidad (contra un `client` de PostgreSQL simulado, ver arriba), pero no de extremo a extremo contra D1/PostgreSQL reales durante un failover real.

Los tests que no requieren esa infraestructura sí se ejecutaron y pasaron completamente.

## Prueba real de infraestructura

**Pendiente.**

No se puede marcar como realizada desde el ZIP porque no contiene una URL pública real de Railway ni credenciales/infraestructura externa verificable.

Debe hacerse posteriormente:

1. Configurar `window.EOF_SECONDARY_API_URL` con la URL pública real de Railway.
2. Confirmar `/api/health` de primaria y secundaria.
3. Confirmar login en primaria.
4. Simular caída de primaria.
5. Confirmar lecturas desde secundaria.
6. Confirmar `/api/me` y sesión durante failover.
7. Probar POST/PUT/DELETE sin duplicados.
8. Restaurar primaria.
9. Confirmar recuperación estable hacia PRIMARY.
10. Aplicar `worker/migracion_origin_write_id.sql` sobre D1 y `worker-secondary/db/migrations/004_origin_write_id.sql` sobre PostgreSQL (ninguna de las dos se ha aplicado desde este entorno; son solo el SQL de la migración, ver más abajo).
11. Provocar un INSERT real (crear un artículo o resultado) durante un failover real y confirmar que, tras la siguiente sincronización D1 -> PostgreSQL, queda una única fila (no duplicada) y con el `origin_write_id` correcto en ambos lados.

## Riesgos pendientes

1. Falta configurar la URL pública real de Railway.
2. Falta comprobar PostgreSQL real de Railway.
3. Falta prueba real de autenticación durante failover.
4. Falta prueba real de caída y recuperación.
5. Falta validación real de escrituras durante un incidente.
6. Falta validar en producción la sincronización D1/PostgreSQL durante el escenario de failover.
7. **Nuevo:** las migraciones `origin_write_id` (D1 y PostgreSQL) todavía no se han aplicado sobre ninguna base real -- son SQL nuevo, revisado y sintácticamente coherente con el resto del esquema, pero sin ejecutar. Aplicarlas es un requisito previo a que la reconciliación de altas duplicadas funcione en producción; hasta entonces, ese límite sigue existiendo tal cual estaba documentado en `003_pending_writes.sql` originalmente.
8. La reconciliación por `origin_write_id` no cubre `comments`, `match_events`, `media` ni el resto de tablas de solo-inserción -- solo `articles` y `results`, que son las dos tablas donde un redactor crea contenido de negocio directamente y donde el duplicado sería más visible y más costoso de arreglar a mano. Si se detecta el mismo problema en otra tabla, el patrón (columna `origin_write_id` + `reconciliarFilasPorOriginWriteId`) es reutilizable sin cambios de diseño.

## Porcentaje real

**85% — máximo razonable verificable desde el ZIP**, sin cambios respecto a la valoración original: lo añadido en esta revisión (tests reescritos + reconciliación de altas duplicadas) corrige una regresión de los tests existentes y cierra un límite ya documentado, pero no cambia la naturaleza de lo que falta -- sigue siendo, en su totalidad, validación contra infraestructura real que este entorno no tiene.

El código y las pruebas locales del mecanismo están terminados. El porcentaje restante corresponde a infraestructura y pruebas reales que no pueden certificarse únicamente inspeccionando o ejecutando el ZIP.

## Fase siguiente

**NO se inicia la Fase 6.**
