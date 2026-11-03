// ---------------------------------------------------------------------
// ACTUALIZACIÓN EN DIRECTO (sin recargar la página)
//
// Pequeño planificador compartido por todas las páginas públicas. Cada
// módulo (portada, noticias rápidas, categorías...) registra una tarea
// con EOF_VIVO.cada(nombre, fn, ms) y este archivo se encarga de lo
// delicado, para no gastar de más ni al navegador ni a la API/D1:
//
//  - Solo consulta con la pestaña A LA VISTA. Al volver a ella, si la
//    tarea llevaba más de `ms` sin ejecutarse, la lanza al momento.
//  - Se detiene sin conexión y reanuda al recuperarla.
//  - Nunca solapa dos ejecuciones de la misma tarea.
//  - Si la tarea falla, espacia los reintentos (x2 hasta 5 min) y
//    vuelve al ritmo normal en cuanto acierta.
//  - Mete un pequeño desfase aleatorio (±15 %) para que miles de
//    lectores no consulten todos en el mismo segundo.
//  - Con "ahorro de datos" activado en el dispositivo, duplica el
//    intervalo.
//
// Las tareas deben comparar una FIRMA de lo recibido con la anterior
// (EOF_VIVO.firma) y repintar SOLO si ha cambiado: así no hay parpadeos,
// no se pierde el scroll ni el foco, y lo que el lector esté haciendo
// (un modal abierto, un texto seleccionado) no se interrumpe.
//
// La API ya cachea las lecturas públicas 10-15 s por centro de datos
// (CACHE_PUBLICA_TTL_MS en worker/src/index.js), por lo que consultar
// cada 20-30 s no multiplica las lecturas a D1: es la caché la que
// responde.
// ---------------------------------------------------------------------
(function () {
  "use strict";
  if (window.EOF_VIVO) return; // ya cargado (la página puede incluirlo dos veces)

  const MAX_BACKOFF_MS = 5 * 60 * 1000;
  const tareas = new Map(); // nombre -> estado

  function ahorroDeDatos() {
    try { return !!(navigator.connection && navigator.connection.saveData); } catch { return false; }
  }

  function visible() { return document.visibilityState !== "hidden"; }
  function enLinea() { return navigator.onLine !== false; }

  function programar(t, retrasoMs) {
    clearTimeout(t.timer);
    t.timer = null;
    if (t.parada) return;
    const base = retrasoMs != null ? retrasoMs : t.ms * (ahorroDeDatos() ? 2 : 1) * Math.pow(2, Math.min(t.fallos, 5));
    const espera = Math.min(MAX_BACKOFF_MS, Math.max(1000, base));
    const jitter = espera * (0.85 + Math.random() * 0.3);
    t.timer = setTimeout(() => ejecutar(t), jitter);
  }

  async function ejecutar(t) {
    t.timer = null;
    if (t.parada) return;
    // Pestaña oculta o sin red: no se consulta; se retomará al volver.
    if (!visible() || !enLinea()) { t.pendiente = true; return; }
    if (t.enCurso) return;
    t.enCurso = true;
    t.pendiente = false;
    try {
      await t.fn();
      t.fallos = 0;
    } catch (err) {
      t.fallos += 1;
      if (window.console && console.debug) console.debug("[en-vivo] " + t.nombre + " falló:", err);
    } finally {
      t.enCurso = false;
      t.ultima = Date.now();
      programar(t);
    }
  }

  // Registra (o sustituye) una tarea periódica.
  //   nombre: id único; registrar dos veces el mismo nombre la reemplaza.
  //   fn:     función (puede ser async). Si lanza error, se aplica el backoff.
  //   ms:     intervalo normal entre ejecuciones.
  //   opts.inmediata: ejecuta una vez ya, además de programarla (por defecto no:
  //                   normalmente la carga inicial ya la hizo el propio módulo).
  function cada(nombre, fn, ms, opts) {
    detener(nombre);
    const t = { nombre, fn, ms: Math.max(5000, Number(ms) || 30000), timer: null, enCurso: false, fallos: 0, ultima: Date.now(), pendiente: false, parada: false };
    tareas.set(nombre, t);
    if (opts && opts.inmediata) ejecutar(t); else programar(t, t.ms);
    return () => detener(nombre);
  }

  function detener(nombre) {
    const t = tareas.get(nombre);
    if (!t) return;
    t.parada = true;
    clearTimeout(t.timer);
    tareas.delete(nombre);
  }

  // Fuerza una ejecución inmediata de una tarea (p. ej. tras publicar un
  // voto o un comentario propio, para verlo reflejado al instante).
  function ahora(nombre) {
    const t = tareas.get(nombre);
    if (t) { clearTimeout(t.timer); ejecutar(t); }
  }

  // Firma estable y barata de cualquier valor JSON. No es criptográfica:
  // solo sirve para saber "¿es lo mismo que la vez anterior?". Se ignoran
  // las claves cuyo nombre empieza por "_" (campos internos del cliente).
  function firma(valor) {
    let texto;
    try {
      texto = JSON.stringify(valor, (k, v) => (typeof k === "string" && k.charAt(0) === "_" ? undefined : v));
    } catch { return String(Math.random()); }
    if (texto === undefined) return "u";
    let h1 = 5381, h2 = 52711;
    for (let i = 0; i < texto.length; i++) {
      const c = texto.charCodeAt(i);
      h1 = ((h1 << 5) + h1) ^ c;
      h2 = ((h2 << 5) + h2 + c) | 0;
    }
    return (h1 >>> 0).toString(36) + "." + (h2 >>> 0).toString(36) + "." + texto.length;
  }

  // Resalta brevemente un elemento recién añadido o cambiado.
  function resaltar(el) {
    if (!el || !el.classList) return;
    el.classList.remove("eof-vivo-nuevo");
    // fuerza reflow para reiniciar la animación si se repite
    void el.offsetWidth;
    el.classList.add("eof-vivo-nuevo");
    setTimeout(() => el.classList.remove("eof-vivo-nuevo"), 2500);
  }

  // Al volver a la pestaña o recuperar la red: se ponen al día las tareas
  // que habrían tocado mientras tanto.
  function reanudar() {
    if (!visible() || !enLinea()) return;
    const ahoraMs = Date.now();
    tareas.forEach((t) => {
      if (t.enCurso || t.parada) return;
      if (t.pendiente || ahoraMs - t.ultima >= t.ms) {
        // pequeño escalonado para no lanzar todas las tareas a la vez
        clearTimeout(t.timer);
        t.timer = setTimeout(() => ejecutar(t), Math.random() * 800);
      } else if (!t.timer) {
        programar(t);
      }
    });
  }

  document.addEventListener("visibilitychange", reanudar);
  window.addEventListener("online", reanudar);
  window.addEventListener("pageshow", (ev) => { if (ev.persisted) reanudar(); }); // bfcache

  window.EOF_VIVO = { cada, detener, ahora, firma, resaltar };
})();
