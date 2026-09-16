# FASE 6 — Tanda de penaltis y goles en propia puerta

## Qué se ha implementado

Dos añadidos al sistema de resultados/eventos ya existente (ver
`FASE5-minuto-a-minuto.md`):

1. **Tanda de penaltis**: para partidos eliminatorios que se deciden
   así. Se registra lanzamiento a lanzamiento (marcado / fallado o
   parado), y el resultado del tiempo reglamentario se muestra en
   grande junto con el de la tanda, más pequeño y entre paréntesis,
   justo debajo.
2. **Gol en propia puerta**: un nuevo tipo de evento que suma en el
   marcador al equipo contrario del que se indica.

No se ha tocado nada del sistema de eventos existente (gol, tarjetas,
cambios, VAR, cronómetro...); todo esto se añade en paralelo.

## Base de datos

Migración: `worker/migracion_penaltis_propia_puerta.sql`

```
wrangler d1 execute elotrofutbol --remote --file=worker/migracion_penaltis_propia_puerta.sql
```

- `results.penaltis_local` / `results.penaltis_visitante` (INTEGER,
  NULL por defecto): goles de la tanda. `NULL` en los dos = el partido
  no se decidió por penaltis. El resultado del tiempo reglamentario
  (`goles_local` / `goles_visitante`) no se toca nunca por esto.
- No hace falta ninguna columna nueva en `match_events`: los
  lanzamientos de la tanda y los goles en propia puerta se guardan con
  los tipos nuevos de siempre (`tipo` ya era `TEXT` libre):
  - `penalti_marcado` / `penalti_fallado_tanda`: en estos dos,
    `equipo` es el equipo que tira y `minuto` se reutiliza como el
    **número de orden del lanzamiento** (1, 2, 3...), no un minuto de
    partido real.
  - `gol_pp`: `equipo` es el equipo del jugador que se lo mete en su
    propia portería (el gol beneficia al rival).

`schema.sql` también se ha actualizado, así que las instalaciones
nuevas ya nacen con estas columnas.

## Backend (Worker)

- `recalcularMarcadorDesdeEventos`: un evento `gol_pp` ahora suma un
  gol al equipo **contrario** al indicado (función `rival()`).
- Nueva `recalcularPenaltisDesdeEventos`: recuenta los
  `penalti_marcado` de cada equipo y actualiza
  `penaltis_local`/`penaltis_visitante`. Si no queda ningún evento de
  tanda (se borraron todos), los deja en `NULL` otra vez, es decir,
  "este partido no se decidió por penaltis".
- Se llama a ambas funciones desde los tres endpoints de eventos
  (`POST` / `PUT` / `DELETE /api/results/:id/eventos[...]`), así que
  el marcador y la tanda siempre se recalculan solos a partir de los
  eventos guardados — igual que ya pasaba con los goles normales.
- `PUT /api/results/:id` (edición manual del resultado) admite
  `penaltis_local` / `penaltis_visitante` para poder corregirlos a
  mano si hace falta, igual que ya se podía con los goles.

## Panel de administración

### Editor manual "Goles y tarjetas"

- El desplegable de tipo de evento tiene ahora **"Gol en propia
  puerta"**. Al elegirlo aparece un aviso: el equipo seleccionado es
  el del jugador que marca en su propia portería, y el gol sumará al
  rival. No pide asistencia (no tiene sentido en un autogol).
- Bloque nuevo debajo, **"Tanda de penaltis"**, con su propio
  formulario: equipo que tira, resultado (marcado / fallado o
  parado), número de lanzamiento y, opcionalmente, dorsal/jugador.
  Lista editable igual que la de goles y tarjetas.

### Panel "Minuto a minuto"

- Botón **"🥅 Gol en propia puerta"** en la columna de cada equipo,
  junto a los de Gol, Amarilla, Roja, etc.
- Botón central **"🥅⚽ Tanda de penaltis"**, que abre un modal aparte
  con:
  - El marcador de la tanda en el título.
  - Lista de lanzamientos ya registrados (editable/borrable).
  - Formulario para añadir el siguiente lanzamiento, que se precarga
    solo con el número de orden siguiente y alterna el equipo
    propuesto (local, visitante, local...) para ir más rápido durante
    la tanda en directo.
  - Este botón sigue disponible aunque el partido ya esté marcado
    como "Finalizado" (el caso normal: el tiempo reglamentario
    termina empatado y la tanda se juega justo después).
- El timeline principal del panel ya no mezcla los lanzamientos de la
  tanda con el resto de eventos (tienen su propio bloque, ordenados
  por lanzamiento en vez de por minuto).

### Listado "Ver resultados"

La columna de resultado muestra ahora, en pequeño debajo del
marcador, el resultado de la tanda cuando la hay: `(4 - 2 pen.)`.

## Web pública

- **Tarjetas de partido**, **modal de detalle** y **marcador dentro de
  una noticia** vinculada: el resultado del tiempo reglamentario se
  muestra igual que siempre, y si el partido se decidió por penaltis
  se añade debajo, más pequeño y entre paréntesis: `(4 - 2 p.)`.
- En el **modal de detalle**, la tanda de penaltis se pinta en un
  bloque aparte, con su propio título ("Tanda de penaltis") y cada
  lanzamiento marcado en verde (anotado) o rojo (fallado/parado),
  ordenados por lanzamiento (1º, 2º, 3º...) — no se mezcla con el
  timeline de goles/tarjetas por minutos.
- Un gol en propia puerta se muestra en el timeline como cualquier
  gol, con el texto "(p.p.)" junto al nombre del jugador.

## Ficheros tocados

- `worker/schema.sql`
- `worker/migracion_penaltis_propia_puerta.sql` (nuevo)
- `worker/src/index.js`
- `public/js/config.js`
- `public/js/partidos.js`
- `public/css/style.css`
- `public/admin/panel.html`
- `public/admin/js/admin.js`
- `public/admin/js/minuto-a-minuto.js`
- `public/admin/css/admin.css`

Todos los `<script>`/`<link>` que apuntan a estos ficheros se han
actualizado con un número de versión (`?v=`) más alto para forzar la
recarga en el navegador tras el despliegue.

## Pendiente de probar antes de desplegar a producción

1. Ejecutar la migración en remoto (ver comando arriba) **antes** de
   desplegar el Worker nuevo.
2. Probar en local/staging:
   - Añadir un gol en propia puerta y comprobar que suma al marcador
     del equipo rival, no del equipo seleccionado.
   - Registrar una tanda de penaltis completa (varios lanzamientos,
     algún fallo) desde el panel Minuto a Minuto y comprobar que:
     - El marcador de la tanda se recalcula bien en tiempo real.
     - Se ve correctamente en la web pública (tarjeta, modal, y si
       aplica, dentro de una noticia vinculada).
   - Editar/borrar un lanzamiento de la tanda ya guardado y comprobar
     que el recuento se ajusta solo.
   - Un partido sin tanda de penaltis sigue mostrando el marcador
     exactamente igual que antes (sin el paréntesis).
