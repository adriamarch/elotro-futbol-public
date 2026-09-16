# Panel de MINUTO A MINUTO

## Qué se ha implementado

Un panel interactivo, a pantalla completa, para que un redactor o admin
narre un partido en directo pulsando botones grandes (Gol, Amarilla,
Roja, Cambio, Descanso, Final...), en vez de rellenar el formulario
manual de "Goles y tarjetas" que ya existía.

### Acceso

- Botón **"⚽ Minuto a minuto"** en la tabla "Ver resultados" y en el
  bloque de "Goles y tarjetas" al editar un partido.
- Solo visible/permitido si el usuario puede gestionar ese resultado
  (autor, admin, o permiso temporal aprobado — mismo sistema que ya
  existía) **y** es el día del partido, con un margen de 3 horas antes
  y después (por si el redactor entra un poco pronto o el partido se
  alarga). Se comprueba en el frontend (para no mostrar el botón) **y**
  en el backend (para que no se pueda saltar llamando a la API
  directamente).
- Una vez el partido está "Finalizado", el panel pasa a modo solo
  lectura: para corregir algo hay que usar "Editar" como siempre.

### Cronómetro

- Cronómetro automático: al pulsar "Iniciar partido" se guarda en el
  servidor el instante real (`inicio_cronometro_at`), y el minuto que
  ve el redactor se calcula en el propio navegador cada segundo a
  partir de esa marca (no hace falta preguntar al servidor cada tick).
- El minuto propuesto en cada evento es siempre el del cronómetro en
  ese instante, pero **es editable**: al pulsar un botón se abre un
  mini-formulario con el minuto precargado (se puede corregir a mano,
  p. ej. para anotar un gol "a toro pasado" o marcar un +2 de
  descuento).
- "Descanso" congela el cronómetro (`cronometro_pausado_en`); "Comienza
  la 2ª parte" lo retoma exactamente desde ese minuto, no desde 0
  (`POST /cronometro` admite `minuto_inicial`).
- "Final del partido" pide confirmación, congela el cronómetro y pasa
  el resultado a estado "Finalizado".

### Botonera

Separada en tres columnas: equipo local | eventos del partido | equipo
visitante. Por equipo: Gol, Amarilla, 2ª amarilla, Roja, Cambio,
Penalti fallado. Centrales: VAR, Otra incidencia, Descanso, Final.

Los botones de Gol/tarjeta/cambio abren el mismo mini-formulario que ya
existía en el editor manual (minuto, dorsal, nombre), y en el caso de
"Cambio" además pide el jugador que sale.

### Sincronización con el resto de la web

- Cada evento se guarda al instante (`POST /api/results/:id/eventos`),
  así que el modal de detalle en `resultados.html` y el marcador dentro
  de una noticia vinculada se actualizan en cuanto el usuario recarga
  esas páginas — no hace falta ningún paso adicional.
- **El marcador se recalcula solo**: cada vez que se crea/edita/borra
  un evento de tipo "gol", el backend recuenta los goles de cada
  equipo a partir de `match_events` y actualiza `goles_local` /
  `goles_visitante`. Ya no hace falta ir al formulario de "Editar
  resultado" a teclear el marcador a mano.
- Al primer evento registrado, si el partido seguía "Por jugar" pasa
  automáticamente a "En juego".

## Cambios en el backend (worker/src/index.js)

- Nuevo endpoint `POST /api/results/:id/cronometro` (acciones
  `iniciar` / `pausar`), con las mismas comprobaciones de permiso que
  el resto de acciones sobre un resultado, más la comprobación de "es
  el día del partido".
- `match_events` admite ahora también: `cambio`, `penalti_fallado`,
  `var`, `inicio_partido`, `descanso`, `fin_descanso`, `fin_partido`,
  `otro`. Los cuatro últimos y `otro` no llevan equipo (se guardan como
  `equipo = 'ninguno'`).
- Nueva columna `match_events.jugador_sale` (solo se usa en "cambio";
  "jugador" pasa a significar "el que entra" para ese tipo).
- Nuevas columnas en `results`: `inicio_cronometro_at`,
  `cronometro_pausado_en`.
- `recalcularMarcadorDesdeEventos()`: se llama tras crear/editar/borrar
  cualquier evento de tipo "gol".

## Migración necesaria en producción

Si la base de datos D1 ya estaba desplegada, hay que ejecutar:

```
wrangler d1 execute elotrofutbol --remote --file=worker/migracion_minuto_a_minuto.sql
```

(`schema.sql` ya incluye estos campos para instalaciones nuevas.)

## Archivos nuevos/tocados

- `worker/migracion_minuto_a_minuto.sql` (nuevo)
- `worker/schema.sql`, `worker/src/index.js`
- `public/admin/js/minuto-a-minuto.js` (nuevo — toda la lógica del panel)
- `public/admin/js/admin.js` (botón de acceso + helper de fecha)
- `public/admin/panel.html` (contenedor del overlay + script)
- `public/admin/css/admin.css` (estilos del panel, al final del archivo)
- `public/js/config.js`, `public/js/partidos.js`, `public/css/style.css`
  (pintar los nuevos tipos de evento en la web pública)

## Pendiente de probar en real (no lo puedo comprobar sin desplegar)

- [ ] Ejecutar la migración en D1 antes de desplegar el worker nuevo.
- [ ] Crear un partido "Por jugar" con fecha de hoy, abrir el panel,
      iniciar el cronómetro, registrar un par de goles y tarjetas, y
      comprobar que el marcador de la lista de resultados y de
      `resultados.html` se actualiza solo.
- [ ] Probar "Descanso" → "Comienza la 2ª parte" y comprobar que el
      cronómetro sigue desde el mismo minuto en que se pausó.
- [ ] Probar "Cambio" (entra/sale) y ver cómo queda en el detalle
      público.
- [ ] Intentar entrar al panel de un partido de otro día (o llamando
      directamente a la API) y confirmar que lo bloquea.
- [ ] Responsive en móvil (la botonera pasa a una columna).

## v2 — Arreglos de sincronización, minuto editable, hidratación, retrasado/anulado, asistencias

Cambios sobre lo anterior, pensados para que el sistema MANUAL y el panel
MINUTO A MINUTO nunca puedan desincronizarse entre sí:

- **Arranque único del cronómetro** (`iniciarCronometroPartido()` en el
  Worker): la usan el cron nuevo, el "En juego" manual y "Iniciar
  partido" del panel. Nunca hay un partido `en_juego` sin cronómetro.
- **Cron nuevo**: cada minuto, si un partido "programado" ya alcanzó su
  `fecha_partido`, pasa solo a "en_juego" y arranca el cronómetro.
- **"En juego" manual**: si se marca a mano y no había cronómetro
  corriendo, arranca calculando los minutos ya pasados desde la hora
  programada (ej. partido a las 14:00, lo marcas a las 14:15 → arranca
  en el minuto 15), en vez de desde 0.
- **Minuto editable**: nueva acción `ajustar_minuto` en
  `POST /api/results/:id/cronometro`; en el panel, clic sobre el reloj.
- **Pausa de hidratación**: mismo mecanismo que "Descanso" (pausa el
  cronómetro), tipo de evento propio (`pausa_hidratacion` /
  `fin_pausa_hidratacion`) para distinguirla en el timeline.
- **Partido retrasado / anulado**: nuevos estados `results.estado`.
  "Retrasado" pide la nueva hora (se guarda en
  `fecha_partido_retrasado`, sin perder la original). "Anulado" detiene
  el cronómetro y deja el panel en solo lectura.
- **Gol anulado por VAR**: nuevo tipo de evento `gol_var`; no cuenta
  para el marcador (recalcularMarcadorDesdeEventos solo suma `gol`).
- **Asistencias**: columna `match_events.jugador_asistencia`, rellenable
  en el mini-formulario de gol tanto en el panel como en el manual.

Migración nueva: `worker/migracion_minuto_a_minuto_v2.sql`.
