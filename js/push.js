// Notificaciones push de ELOTROFUTBOLTV (opt-in, siempre por decision de
// la persona). Se carga desde layout.js en todas las paginas publicas.
// Registra el service worker (/sw.js), enlaza el manifest (PWA) y pinta
// un boton flotante de campana para activar/desactivar los avisos.
(function () {
  "use strict";

  var API = (typeof API_URL !== "undefined" && API_URL) || "https://api.elotrofutbol.media";
  var CLAVE_PREFS = "eof_push_prefs";

  // Manifest: se enlaza aqui para no tocar el <head> de cada pagina.
  if (!document.querySelector('link[rel="manifest"]')) {
    var m = document.createElement("link");
    m.rel = "manifest";
    m.href = "/manifest.webmanifest";
    document.head.appendChild(m);
  }
  if (!document.querySelector('meta[name="theme-color"]')) {
    var t = document.createElement("meta");
    t.name = "theme-color";
    t.content = "#0c1b2e";
    document.head.appendChild(t);
  }

  var soportado = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  var esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  var instalada = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  // En iOS el push solo funciona con la web anadida a la pantalla de inicio.
  var requiereInstalar = esIOS && !instalada;

  if (!soportado && !requiereInstalar) return;
  if (/(^|\/)acceso(\.html)?\/?$/.test(location.pathname)) return;

  var MAX_CLUBES = 12;
  function prefsPorDefecto() { return { noticias: true, partidos: true, solo_clubes: false, clubes: [] }; }
  function leerPrefs() {
    var p;
    try { p = JSON.parse(localStorage.getItem(CLAVE_PREFS)); } catch (e) { p = null; }
    var d = prefsPorDefecto();
    if (!p || typeof p !== "object") return d;
    return {
      noticias: p.noticias !== false,
      partidos: p.partidos !== false,
      solo_clubes: p.solo_clubes === true && Array.isArray(p.clubes) && p.clubes.length > 0,
      clubes: Array.isArray(p.clubes) ? p.clubes.filter(function (c) { return typeof c === "string" && c; }).slice(0, MAX_CLUBES) : [],
    };
  }
  function guardarPrefs(p) {
    try { localStorage.setItem(CLAVE_PREFS, JSON.stringify(p)); } catch (e) { /* modo privado */ }
  }
  function base64UrlAUint8(b64) {
    var relleno = "=".repeat((4 - (b64.length % 4)) % 4);
    var bin = atob((b64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, function (c) { return c.charCodeAt(0); });
  }
  function mismosBytes(buffer, uint8) {
    if (!buffer) return false;
    var a = new Uint8Array(buffer);
    if (a.length !== uint8.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== uint8[i]) return false;
    return true;
  }
  // Si algo no responde nunca (p. ej. un service worker que no llega a
  // activarse en movil), se corta con un error claro en vez de dejar el
  // boton en "Un momento..." para siempre.
  function conTimeout(promesa, ms, codigo) {
    return new Promise(function (resolve, reject) {
      var temporizador = setTimeout(function () { reject(new Error(codigo)); }, ms);
      promesa.then(function (v) { clearTimeout(temporizador); resolve(v); },
                   function (e) { clearTimeout(temporizador); reject(e); });
    });
  }

  function registrarSW() {
    return navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(function () {
      return conTimeout(navigator.serviceWorker.ready, 10000, "sw-timeout");
    });
  }
  function suscripcionActual() {
    return registrarSW().then(function (reg) { return reg.pushManager.getSubscription(); });
  }

  function enviarAlServidor(sub, prefs) {
    return fetch(API + "/api/push/suscribir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        suscripcion: sub.toJSON(), noticias: !!prefs.noticias, partidos: !!prefs.partidos,
        clubes: prefs.clubes || [], solo_clubes: !!prefs.solo_clubes,
      }),
    }).then(function (r) { if (!r.ok) throw new Error("servidor-" + r.status); });
  }

  // ---------- Lista de equipos (para "Mis equipos") ----------
  // clubs.js solo esta en algunas paginas: si no esta, se carga al necesitarlo.
  var listaClubes = null, promesaClubes = null;
  var COMPS = [
    ["hypermotion", "Hypermotion"],
    ["primera_federacion", "1.\u00aa Fed."],
    ["segunda_federacion", "2.\u00aa Fed."],
    ["otros", "Otros"]
  ];
  function normalizar(t) {
    return String(t || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  }
  function cargarScript(src) {
    return new Promise(function (resolve, reject) {
      var sc = document.createElement("script");
      sc.src = src; sc.async = true;
      sc.onload = resolve;
      sc.onerror = function () { reject(new Error("clubs-no-carga")); };
      document.head.appendChild(sc);
    });
  }
  // Escudo del club: el mismo que usa el resto de la web (clubs.js resuelve
  // alias y filiales). Siempre ruta absoluta; si falla, escudo generico.
  function urlEscudo(nombre, personalizado) {
    var u = personalizado || "";
    try { if (!u && typeof getEscudoUrl === "function") u = getEscudoUrl(nombre); } catch (e) { /* sin escudo */ }
    if (!u) u = "img/escudos/generico.svg";
    return /^https?:/i.test(u) ? u : "/" + u.replace(/^\/+/, "");
  }
  function cargarClubes() {
    if (listaClubes) return Promise.resolve(listaClubes);
    if (promesaClubes) return promesaClubes;
    var previa = typeof CLUBS_BY_CATEGORY !== "undefined" ? Promise.resolve() : cargarScript("/js/clubs.js?v=6");
    promesaClubes = previa.then(function () {
      var crudos = []; // { n, comp, esc }
      if (typeof CLUBS_BY_CATEGORY !== "undefined") {
        Object.keys(CLUBS_BY_CATEGORY).forEach(function (k) {
          CLUBS_BY_CATEGORY[k].forEach(function (n) { crudos.push({ n: n, comp: k }); });
        });
      }
      if (typeof TODOS_LOS_CLUBES_SEGUNDA_FEDERACION_PLANO !== "undefined") {
        TODOS_LOS_CLUBES_SEGUNDA_FEDERACION_PLANO.forEach(function (n) { crudos.push({ n: n, comp: "segunda_federacion" }); });
      }
      // Clubes dados de alta a mano desde el panel (si el servidor responde).
      return fetch(API + "/api/custom-clubs").then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          ((d && d.clubes) || []).forEach(function (c) {
            if (c && c.nombre) crudos.push({ n: c.nombre, comp: c.categoria || "otros", esc: c.escudo_url });
          });
        })
        .catch(function () {})
        .then(function () {
          var vistos = {}, salida = [];
          crudos.forEach(function (c) {
            var k = normalizar(c.n);
            if (!k || vistos[k]) return;
            vistos[k] = 1;
            var comp = COMPS.some(function (x) { return x[0] === c.comp; }) ? c.comp : "otros";
            salida.push({ n: c.n, k: k, comp: comp, esc: urlEscudo(c.n, c.esc) });
          });
          salida.sort(function (a, b) { return a.n.localeCompare(b.n, "es"); });
          listaClubes = salida;
          return salida;
        });
    }).catch(function (e) { promesaClubes = null; throw e; });
    return promesaClubes;
  }
  // Filtra por competicion y texto (sin tildes; "castellon" encuentra "CD Castellon").
  function filtrarClubes(comp, texto) {
    var q = normalizar(texto);
    return (listaClubes || []).filter(function (c) {
      if (comp !== "todos" && c.comp !== comp) return false;
      if (!q) return true;
      return c.k.indexOf(q) !== -1;
    });
  }

  // Safari antiguo usa callback en vez de promesa en requestPermission.
  function pedirPermiso() {
    return new Promise(function (resolve, reject) {
      try {
        var r = Notification.requestPermission(resolve);
        if (r && typeof r.then === "function") r.then(resolve, reject);
      } catch (e) { reject(e); }
    });
  }

  function activar(prefs) {
    return pedirPermiso().then(function (permiso) {
      if (permiso !== "granted") throw new Error("permiso-denegado");
      return fetch(API + "/api/push/clave").then(function (r) {
        if (!r.ok) throw new Error("clave-" + r.status);
        return r.json();
      });
    }).then(function (d) {
      if (!d || !d.clave) throw new Error("sin-clave");
      var clave = base64UrlAUint8(d.clave);
      return registrarSW().then(function (reg) {
        return reg.pushManager.getSubscription().then(function (existente) {
          // Si la clave del servidor cambio, la suscripcion vieja ya no
          // sirve: se da de baja y se crea otra con la clave actual.
          if (existente && existente.options && existente.options.applicationServerKey &&
              !mismosBytes(existente.options.applicationServerKey, clave)) {
            return existente.unsubscribe().then(function () { return null; });
          }
          return existente;
        }).then(function (existente) {
          return existente || reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: clave,
          });
        });
      });
    }).then(function (sub) {
      return enviarAlServidor(sub, prefs);
    });
  }

  function desactivar() {
    return suscripcionActual().then(function (sub) {
      if (!sub) return;
      var endpoint = sub.endpoint;
      return sub.unsubscribe().then(function () {
        return fetch(API + "/api/push/baja", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: endpoint }),
        }).catch(function () { /* el servidor la limpia solo al recibir un 410 */ });
      });
    });
  }

  // Traduce el error tecnico a algo que la persona entienda, y deja el
  // codigo debajo para poder diagnosticarlo sin abrir la consola.
  function mensajeDeError(err) {
    var cod = String((err && err.message) || err || "error");
    var nombre = String((err && err.name) || "");
    var texto;
    if (cod === "permiso-denegado") {
      return { texto: "Has bloqueado las notificaciones. Act\u00edvalas en los ajustes del navegador para este sitio.", codigo: "" };
    }
    if (cod === "clave-503" || cod === "sin-clave") {
      texto = "Los avisos todav\u00eda no est\u00e1n disponibles en el servidor. Int\u00e9ntalo m\u00e1s tarde.";
    } else if (/^(clave|servidor)-\d+$/.test(cod)) {
      texto = "El servidor no ha respondido bien. Int\u00e9ntalo de nuevo en unos minutos.";
    } else if (nombre === "TypeError" || /failed to fetch|networkerror|load failed/i.test(cod)) {
      texto = "No hay conexi\u00f3n con el servidor. Revisa tu internet e int\u00e9ntalo de nuevo.";
    } else if (cod === "sw-timeout" || nombre === "AbortError" || nombre === "InvalidStateError" || nombre === "NotSupportedError" || nombre === "SecurityError") {
      texto = "Tu navegador no ha podido registrar los avisos. Cierra y abre el navegador, o prueba con Chrome o Firefox actualizado.";
    } else {
      texto = "No se han podido activar los avisos. Int\u00e9ntalo de nuevo m\u00e1s tarde.";
    }
    return { texto: texto, codigo: nombre && nombre !== "Error" ? nombre + ": " + cod : cod };
  }

  // ---------- UI ----------
  var css = document.createElement("style");
  css.textContent = [
    ".eof-push-btn{position:fixed;left:calc(12px + env(safe-area-inset-left,0px));bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:900;",
    "width:44px;height:44px;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,.18);cursor:pointer;",
    "background:var(--marino,#0c1b2e);color:#fff;box-shadow:0 4px 14px rgba(12,27,46,.35);display:flex;align-items:center;justify-content:center;",
    "-webkit-tap-highlight-color:transparent;transition:transform .15s}",
    ".eof-push-btn:active{transform:scale(.94)}",
    ".eof-push-btn svg{width:21px;height:21px;display:block}",
    ".eof-push-btn[data-activo='1']::after{content:'';position:absolute;top:8px;right:9px;width:9px;height:9px;border-radius:50%;background:#2fbf71;border:2px solid var(--marino,#0c1b2e);box-sizing:content-box}",
    ".eof-push-fondo{position:fixed;inset:0;z-index:8999;background:rgba(8,16,28,.55);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}",
    ".eof-push-fondo[hidden],.eof-push-panel[hidden]{display:none}",
    /* Movil: hoja que sube desde abajo, a todo el ancho. */
    ".eof-push-panel{position:fixed;left:0;right:0;bottom:0;z-index:9000;box-sizing:border-box;max-height:90vh;max-height:90dvh;overflow-y:auto;overscroll-behavior:contain;",
    "background:#fff;color:#0c1b2e;border-radius:22px 22px 0 0;box-shadow:0 -10px 40px rgba(12,27,46,.35);",
    "padding:10px 20px calc(22px + env(safe-area-inset-bottom,0px));font-family:var(--font-text,Arial,sans-serif);font-size:15px;line-height:1.45;",
    "animation:eofPushSube .26s cubic-bezier(.2,.85,.25,1)}",
    "@keyframes eofPushSube{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}",
    ".eof-push-panel::before{content:'';display:block;width:42px;height:4px;border-radius:4px;background:currentColor;opacity:.2;margin:0 auto 14px}",
    "[data-theme='dark'] .eof-push-panel{background:#16273d;color:#eef1f5}",
    ".eof-push-cab{display:flex;align-items:flex-start;gap:12px;margin-bottom:6px}",
    ".eof-push-icono{flex:none;width:42px;height:42px;border-radius:12px;background:var(--marino,#0c1b2e);color:#fff;display:flex;align-items:center;justify-content:center}",
    ".eof-push-icono svg{width:22px;height:22px}",
    ".eof-push-panel h3{margin:0;font-size:18px;line-height:1.25;font-family:var(--font-tit,Arial,sans-serif);font-weight:600}",
    ".eof-push-sub{margin:2px 0 0;font-size:13.5px;opacity:.75}",
    ".eof-push-cerrar{flex:none;margin:-6px -8px 0 auto;width:44px;height:44px;background:none;border:0;cursor:pointer;color:inherit;opacity:.65;display:flex;align-items:center;justify-content:center}",
    ".eof-push-cerrar svg{width:20px;height:20px}",
    ".eof-push-opciones{margin:14px 0 4px;border:1px solid rgba(127,140,160,.28);border-radius:14px;overflow:hidden}",
    ".eof-push-panel label.eof-push-op{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0;padding:13px 14px;min-height:52px;cursor:pointer;-webkit-tap-highlight-color:transparent}",
    ".eof-push-op + .eof-push-op{border-top:1px solid rgba(127,140,160,.28)}",
    ".eof-push-op strong{display:block;font-weight:600;font-size:15px}",
    ".eof-push-op small{display:block;font-size:12.5px;opacity:.7;margin-top:1px}",
    ".eof-push-op input{-webkit-appearance:none;appearance:none;flex:none;position:relative;width:48px;height:28px;margin:0;border-radius:28px;background:rgba(127,140,160,.45);cursor:pointer;transition:background .2s;outline-offset:3px}",
    ".eof-push-op input::after{content:'';position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);transition:transform .2s}",
    ".eof-push-op input:checked{background:#2fbf71}",
    ".eof-push-op input:checked::after{transform:translateX(20px)}",
    ".eof-eq{margin:16px 0 4px;padding:14px;border-radius:16px;background:rgba(127,140,160,.08);border:1px solid rgba(127,140,160,.22)}",
    ".eof-eq-cab{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}",
    ".eof-eq-cab strong{display:block;font-size:15px;font-weight:700}",
    ".eof-eq-cab small{display:block;font-size:12.5px;opacity:.7;margin-top:1px}",
    ".eof-eq-cont{flex:none;min-width:44px;text-align:center;padding:3px 9px;border-radius:20px;background:rgba(127,140,160,.2);font-size:12.5px;font-weight:700;font-variant-numeric:tabular-nums;transition:background .2s,color .2s}",
    ".eof-eq-cont.lleno{background:var(--rojo,#d1132e);color:#fff}",
    ".eof-eq-cont.sacude{animation:eofSacude .35s}",
    "@keyframes eofSacude{20%,60%{transform:translateX(-4px)}40%,80%{transform:translateX(4px)}}",
    ".eof-eq-sels{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0 0}",
    ".eof-eq-vacio{width:100%;box-sizing:border-box;padding:14px;border:1.5px dashed rgba(127,140,160,.45);border-radius:14px;text-align:center;font-size:13px;line-height:1.4;opacity:.75}",
    ".eof-push-panel button.eof-eq-sel{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;width:72px;margin:0;padding:9px 4px 6px;border:1.5px solid var(--celeste,#5bb8e8);border-radius:14px;background:rgba(91,184,232,.12);color:inherit;font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .15s,opacity .2s}",
    ".eof-eq-sel:active{transform:scale(.93)}",
    ".eof-eq-sel.nuevo{animation:eofPop .38s cubic-bezier(.2,1.4,.4,1)}",
    ".eof-eq-sel.sale{opacity:0;transform:scale(.6)}",
    "@keyframes eofPop{from{transform:scale(.4);opacity:0}to{transform:none;opacity:1}}",
    ".eof-eq-sel img{width:40px;height:40px;object-fit:contain;display:block}",
    ".eof-eq-nom{display:-webkit-box;max-width:100%;font-size:10.5px;line-height:1.15;font-weight:600;text-align:center;overflow:hidden;-webkit-line-clamp:2;-webkit-box-orient:vertical}",
    ".eof-eq-x{position:absolute;top:-7px;right:-7px;width:20px;height:20px;border-radius:50%;background:var(--rojo,#d1132e);color:#fff;font-style:normal;font-size:13px;line-height:20px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.3)}",
    ".eof-push-panel button.eof-eq-abrir{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin:12px 0 0;min-height:46px;padding:8px 12px;border:1.5px dashed rgba(127,140,160,.55);border-radius:12px;background:transparent;color:inherit;font:inherit;font-size:14px;font-weight:600;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .15s}",
    ".eof-eq-abrir:hover{background:rgba(127,140,160,.12)}",
    ".eof-eq-abrir[aria-expanded='true']{border-style:solid;background:rgba(127,140,160,.12)}",
    ".eof-eq-exp{margin-top:10px;animation:eofDesplega .22s ease}",
    ".eof-eq-exp[hidden]{display:none}",
    "@keyframes eofDesplega{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}",
    ".eof-eq-busca{position:relative}",
    ".eof-eq-busca svg{position:absolute;left:12px;top:50%;width:18px;height:18px;margin-top:-9px;opacity:.55;pointer-events:none}",
    ".eof-push-panel input.eof-eq-in{box-sizing:border-box;width:100%;min-height:44px;padding:10px 12px 10px 38px;border:1.5px solid rgba(127,140,160,.45);border-radius:12px;background:transparent;color:inherit;font:inherit;font-size:16px;outline:none;transition:border-color .15s,box-shadow .15s}",
    ".eof-push-panel input.eof-eq-in:focus{border-color:var(--celeste,#5bb8e8);box-shadow:0 0 0 3px rgba(91,184,232,.25)}",
    ".eof-eq-nav{display:flex;gap:6px;margin:10px 0 0;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}",
    ".eof-eq-nav::-webkit-scrollbar{display:none}",
    ".eof-push-panel button.eof-eq-tab{flex:none;margin:0;min-height:34px;padding:6px 12px;border:1px solid rgba(127,140,160,.4);border-radius:20px;background:transparent;color:inherit;font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}",
    ".eof-eq-tab.on{background:var(--marino,#0c1b2e);border-color:var(--marino,#0c1b2e);color:#fff}",
    "[data-theme='dark'] .eof-eq-tab.on{background:var(--celeste,#5bb8e8);border-color:var(--celeste,#5bb8e8);color:#0c1b2e}",
    ".eof-eq-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px;max-height:272px;overflow-y:auto;overscroll-behavior:contain;padding:3px;-webkit-overflow-scrolling:touch}",
    ".eof-push-panel button.eof-eq-tile{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:5px;margin:0;padding:10px 4px 8px;min-height:92px;border:1.5px solid rgba(127,140,160,.3);border-radius:14px;background:transparent;color:inherit;font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .12s,border-color .15s,background .15s}",
    ".eof-eq-tile:hover{border-color:var(--celeste,#5bb8e8)}",
    ".eof-eq-tile:active{transform:scale(.95)}",
    ".eof-eq-tile img{width:40px;height:40px;object-fit:contain}",
    ".eof-eq-tile span{display:-webkit-box;font-size:11px;line-height:1.15;font-weight:600;text-align:center;overflow:hidden;-webkit-line-clamp:2;-webkit-box-orient:vertical}",
    ".eof-eq-tile.on{border-color:#2fbf71;background:rgba(47,191,113,.14)}",
    ".eof-eq-ok{position:absolute;top:5px;right:5px;width:18px;height:18px;border-radius:50%;background:#2fbf71;color:#fff;font-size:11px;line-height:18px;text-align:center;font-style:normal;transform:scale(0);transition:transform .18s cubic-bezier(.2,1.5,.4,1)}",
    ".eof-eq-tile.on .eof-eq-ok{transform:scale(1)}",
    ".eof-eq-msg{grid-column:1/-1;padding:18px 8px;text-align:center;font-size:13px;opacity:.7}",
    "@media (prefers-reduced-motion:reduce){.eof-eq-sel.nuevo,.eof-eq-exp,.eof-eq-cont.sacude{animation:none}}",
    ".eof-push-solo{margin-top:12px;border:1px solid rgba(127,140,160,.28);border-radius:14px}",
    ".eof-push-panel button.eof-push-accion{display:block;width:100%;margin:14px 0 0;min-height:48px;padding:12px;border:0;border-radius:12px;cursor:pointer;font-weight:700;font-size:15px;font-family:inherit;",
    "background:var(--rojo,#d1132e);color:#fff;-webkit-tap-highlight-color:transparent}",
    ".eof-push-panel button.eof-push-accion[disabled]{opacity:.6;cursor:default}",
    ".eof-push-panel button.eof-push-quitar{background:transparent;color:inherit;border:1px solid rgba(127,140,160,.5);margin-top:8px;font-weight:600}",
    ".eof-push-msg{margin-top:12px;font-size:13.5px;line-height:1.4}",
    ".eof-push-msg:empty{display:none}",
    ".eof-push-msg > div{padding:10px 12px;border-radius:10px;background:rgba(127,140,160,.14)}",
    ".eof-push-msg .eof-ok{background:rgba(47,191,113,.16);color:#127a45}",
    "[data-theme='dark'] .eof-push-msg .eof-ok{color:#6ee7a5}",
    ".eof-push-msg .eof-error{background:rgba(209,19,46,.12);color:#a30f24}",
    "[data-theme='dark'] .eof-push-msg .eof-error{color:#ff9aa8}",
    ".eof-push-msg code{display:block;margin-top:4px;font-size:11.5px;opacity:.75;word-break:break-all}",
    ".eof-push-instalar{margin:12px 0 0;padding:0;list-style:none;counter-reset:p}",
    ".eof-push-instalar li{counter-increment:p;display:flex;gap:10px;align-items:flex-start;margin:0 0 10px}",
    ".eof-push-instalar li::before{content:counter(p);flex:none;width:24px;height:24px;border-radius:50%;background:var(--marino,#0c1b2e);color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center}",
    /* Escritorio: tarjeta flotante junto al boton, sin sabana oscura. */
    "@media (min-width:640px){",
    ".eof-push-fondo{background:transparent;-webkit-backdrop-filter:none;backdrop-filter:none}",
    ".eof-push-panel{left:16px;right:auto;bottom:70px;width:384px;max-height:84vh;border-radius:16px;padding:18px 18px 18px;box-shadow:0 10px 34px rgba(12,27,46,.3)}",
    ".eof-push-panel::before{display:none}",
    ".eof-push-btn{left:16px;bottom:16px}}",
    "@media (prefers-reduced-motion:reduce){.eof-push-panel{animation:none}}",
    "@media print{.eof-push-btn,.eof-push-panel,.eof-push-fondo{display:none!important}}",
  ].join("");
  document.head.appendChild(css);

  var ICONO_CAMPANA = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9'/><path d='M10.3 21a1.94 1.94 0 0 0 3.4 0'/></svg>";
  var ICONO_CERRAR = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' aria-hidden='true'><path d='M6 6l12 12M18 6L6 18'/></svg>";
  var ICONO_LUPA = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><circle cx='11' cy='11' r='7'/><path d='M20 20l-3.5-3.5'/></svg>";

  var btn = document.createElement("button");
  btn.className = "eof-push-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", "Avisos en este dispositivo");
  btn.setAttribute("aria-haspopup", "dialog");
  btn.innerHTML = ICONO_CAMPANA;

  var fondo = document.createElement("div");
  fondo.className = "eof-push-fondo";
  fondo.hidden = true;

  var panel = document.createElement("div");
  panel.className = "eof-push-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Avisos de ELOTROFUTBOLTV");
  panel.hidden = true;

  function abrirPanel() { panel.hidden = false; fondo.hidden = false; }
  function cerrarPanel() { panel.hidden = true; fondo.hidden = true; }

  function escapar(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // mensaje: texto simple, o { texto, codigo, tipo } para ok/error.
  function htmlMensaje(mensaje, tipo) {
    if (!mensaje) return "";
    var texto = typeof mensaje === "string" ? mensaje : mensaje.texto;
    var codigo = typeof mensaje === "string" ? "" : mensaje.codigo;
    return "<div class='" + (tipo === "error" ? "eof-error" : tipo === "ok" ? "eof-ok" : "") + "'>" + escapar(texto) +
      (codigo ? "<code>C\u00f3digo: " + escapar(codigo) + "</code>" : "") + "</div>";
  }

  function pintarPanel(activo, mensaje, tipoMensaje) {
    var prefs = leerPrefs();
    var cuerpo;
    if (requiereInstalar) {
      cuerpo =
        "<div class='eof-push-cab'><span class='eof-push-icono'>" + ICONO_CAMPANA + "</span>" +
        "<div><h3>Avisos en el m\u00f3vil</h3><p class='eof-push-sub'>En iPhone y iPad hay que instalar la web primero.</p></div>" +
        "<button type='button' class='eof-push-cerrar' aria-label='Cerrar'>" + ICONO_CERRAR + "</button></div>" +
        "<ol class='eof-push-instalar'>" +
        "<li><span>Toca <strong>Compartir</strong> en Safari.</span></li>" +
        "<li><span>Elige <strong>A\u00f1adir a pantalla de inicio</strong>.</span></li>" +
        "<li><span>Abre la web desde ese icono y activa los avisos.</span></li></ol>";
    } else {
      cuerpo =
        "<div class='eof-push-cab'><span class='eof-push-icono'>" + ICONO_CAMPANA + "</span>" +
        "<div><h3>Avisos en este dispositivo</h3><p class='eof-push-sub'>Te avisamos cuando pase algo. Puedes quitarlos cuando quieras.</p></div>" +
        "<button type='button' class='eof-push-cerrar' aria-label='Cerrar'>" + ICONO_CERRAR + "</button></div>" +
        "<div class='eof-push-opciones'>" +
        "<label class='eof-push-op'><span><strong>Noticias nuevas</strong><small>Cuando se publique una noticia</small></span>" +
        "<input type='checkbox' id='eofPushNoticias'" + (prefs.noticias ? " checked" : "") + "></label>" +
        "<label class='eof-push-op'><span><strong>Goles y finales</strong><small>Goles, anulaciones, correcciones de marcador y finales en directo</small></span>" +
        "<input type='checkbox' id='eofPushPartidos'" + (prefs.partidos ? " checked" : "") + "></label></div>" +
        "<div class='eof-eq'>" +
        "<div class='eof-eq-cab'><div><strong>Mis equipos</strong><small>Goles, finales y noticias de tus clubes</small></div><span class='eof-eq-cont' id='eofEqCont'></span></div>" +
        "<div class='eof-eq-sels' id='eofEqSel'></div>" +
        "<button type='button' class='eof-eq-abrir' id='eofEqAbrir' aria-expanded='false' aria-controls='eofEqExp'></button>" +
        "<div class='eof-eq-exp' id='eofEqExp' hidden>" +
        "<div class='eof-eq-busca'>" + ICONO_LUPA + "<input type='search' class='eof-eq-in' id='eofEqBuscar' placeholder='Busca tu equipo\u2026' autocomplete='off' aria-label='Buscar equipo'></div>" +
        "<div class='eof-eq-nav' id='eofEqNav' role='tablist'></div><div class='eof-eq-grid' id='eofEqGrid'></div></div>" +
        "<label class='eof-push-op eof-push-solo'><span><strong>Solo de mis equipos</strong><small id='eofPushSoloTxt'></small></span>" +
        "<input type='checkbox' id='eofPushSolo'" + (prefs.solo_clubes ? " checked" : "") + "></label></div>" +
        "<button type='button' class='eof-push-accion' id='eofPushAccion'>" + (activo ? "Guardar cambios" : "Activar avisos") + "</button>" +
        (activo ? "<button type='button' class='eof-push-accion eof-push-quitar' id='eofPushQuitar'>Desactivar avisos</button>" : "") +
        "<div class='eof-push-msg' id='eofPushMsg' role='status' aria-live='polite'>" + htmlMensaje(mensaje, tipoMensaje) + "</div>";
    }
    panel.innerHTML = cuerpo;

    panel.querySelector(".eof-push-cerrar").addEventListener("click", cerrarPanel);

    // ---- Mis equipos: seleccion editable hasta pulsar Guardar ----
    var elegidos = prefs.clubes.slice();
    var solo = null;
    if (panel.querySelector("#eofEqSel")) {
    var selEl = panel.querySelector("#eofEqSel");
    var contEl = panel.querySelector("#eofEqCont");
    var abrirEl = panel.querySelector("#eofEqAbrir");
    var expEl = panel.querySelector("#eofEqExp");
    var buscar = panel.querySelector("#eofEqBuscar");
    var navEl = panel.querySelector("#eofEqNav");
    var gridEl = panel.querySelector("#eofEqGrid");
    solo = panel.querySelector("#eofPushSolo");
    var soloTxt = panel.querySelector("#eofPushSoloTxt");
    var compActual = "todos";
    var vista = [];
    var ultimoAnadido = "";

    function imgEscudo(esc) {
      return "<img src='" + escapar(esc) + "' alt='' loading='lazy' decoding='async' draggable='false'>";
    }
    function datosClub(nombre) {
      var k = normalizar(nombre), f = null;
      if (listaClubes) for (var i = 0; i < listaClubes.length; i++) if (listaClubes[i].k === k) { f = listaClubes[i]; break; }
      return f || { n: nombre, k: k, esc: urlEscudo(nombre) };
    }
    function pintarContador() {
      if (!contEl) return;
      contEl.textContent = elegidos.length + "/" + MAX_CLUBES;
      contEl.classList.toggle("lleno", elegidos.length >= MAX_CLUBES);
    }
    function pintarSolo() {
      if (!soloTxt) return;
      soloTxt.textContent = solo.checked
        ? "Solo recibir\u00e1s avisos de tus equipos"
        : (elegidos.length ? "Tambi\u00e9n recibir\u00e1s avisos de otros clubes" : "Elige un equipo para activarlo");
    }
    function pintarAbrir() {
      var abierto = !expEl.hidden;
      abrirEl.setAttribute("aria-expanded", abierto ? "true" : "false");
      abrirEl.textContent = abierto ? "Cerrar la lista" : (elegidos.length ? "\uff0b A\u00f1adir m\u00e1s equipos" : "\uff0b Elegir mis equipos");
    }
    function pintarSel() {
      if (!selEl) return;
      if (!elegidos.length) {
        selEl.innerHTML = "<div class='eof-eq-vacio'>A\u00fan no has elegido ning\u00fan equipo.<br>Elige el tuyo y te avisamos de sus goles, finales y noticias.</div>";
      } else {
        selEl.innerHTML = elegidos.map(function (n, i) {
          var d = datosClub(n);
          return "<button type='button' class='eof-eq-sel" + (n === ultimoAnadido ? " nuevo" : "") + "' data-i='" + i + "' aria-label='Quitar " + escapar(n) + "'>" +
            imgEscudo(d.esc) + "<span class='eof-eq-nom'>" + escapar(n) + "</span><i class='eof-eq-x' aria-hidden='true'>\u00d7</i></button>";
        }).join("");
      }
      ultimoAnadido = "";
      pintarContador(); pintarSolo(); pintarAbrir();
    }
    function pintarNav() {
      if (!navEl || !listaClubes) return;
      var tabs = [["todos", "Todos"]].concat(COMPS.filter(function (c) {
        return listaClubes.some(function (x) { return x.comp === c[0]; });
      }));
      navEl.innerHTML = tabs.map(function (t) {
        return "<button type='button' role='tab' class='eof-eq-tab" + (t[0] === compActual ? " on" : "") + "' data-c='" + t[0] + "' aria-selected='" + (t[0] === compActual) + "'>" + escapar(t[1]) + "</button>";
      }).join("");
    }
    function pintarGrid() {
      if (!gridEl) return;
      var arriba = gridEl.scrollTop;
      if (!listaClubes) { gridEl.innerHTML = "<div class='eof-eq-msg'>Cargando equipos\u2026</div>"; return; }
      vista = filtrarClubes(compActual, buscar.value);
      gridEl.innerHTML = vista.length ? vista.map(function (c, i) {
        var on = elegidos.indexOf(c.n) !== -1;
        return "<button type='button' class='eof-eq-tile" + (on ? " on" : "") + "' data-i='" + i + "' aria-pressed='" + on + "'>" +
          imgEscudo(c.esc) + "<span>" + escapar(c.n) + "</span><i class='eof-eq-ok' aria-hidden='true'>\u2713</i></button>";
      }).join("") : "<div class='eof-eq-msg'>No encontramos ese equipo.</div>";
      gridEl.scrollTop = arriba;
    }
    function abrirLista(abrir) {
      expEl.hidden = !abrir;
      pintarAbrir();
      if (!abrir) return;
      pintarGrid();
      cargarClubes().then(function () { pintarNav(); pintarGrid(); pintarSel(); }).catch(function () {
        gridEl.innerHTML = "<div class='eof-eq-msg'>No se pudo cargar la lista de equipos. Int\u00e9ntalo de nuevo.</div>";
      });
    }
    function vibrar() { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* no soportado */ } }
    // Marca o quita un equipo. Devuelve true si ha quedado elegido.
    function alternar(nombre) {
      var pos = elegidos.indexOf(nombre);
      if (pos !== -1) {
        elegidos.splice(pos, 1);
        if (!elegidos.length) solo.checked = false;
      } else {
        if (elegidos.length >= MAX_CLUBES) {
          contEl.classList.remove("sacude"); void contEl.offsetWidth; contEl.classList.add("sacude");
          return false;
        }
        elegidos.push(nombre);
        ultimoAnadido = nombre;
        // Al elegir el primer equipo se entiende que se quieren solo sus avisos.
        if (elegidos.length === 1) solo.checked = true;
      }
      vibrar();
      pintarSel();
      return elegidos.indexOf(nombre) !== -1;
    }

    abrirEl.addEventListener("click", function () { abrirLista(expEl.hidden); });
    // Si un escudo no carga, se muestra el generico (error no burbujea: captura).
    [selEl, gridEl].forEach(function (c) {
      c.addEventListener("error", function (e) {
        var im = e.target;
        if (im && im.tagName === "IMG" && !im.dataset.fallo) { im.dataset.fallo = "1"; im.src = "/img/escudos/generico.svg"; }
      }, true);
    });
    selEl.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".eof-eq-sel");
      if (!b) return;
      var nombre = elegidos[parseInt(b.getAttribute("data-i"), 10)];
      b.classList.add("sale");
      setTimeout(function () { alternar(nombre); if (!expEl.hidden) pintarGrid(); }, 140);
    });
    gridEl.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".eof-eq-tile");
      if (!b) return;
      var c = vista[parseInt(b.getAttribute("data-i"), 10)];
      if (!c) return;
      var on = alternar(c.n);
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    navEl.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".eof-eq-tab");
      if (!b) return;
      compActual = b.getAttribute("data-c");
      pintarNav(); pintarGrid(); gridEl.scrollTop = 0;
    });
    buscar.addEventListener("input", function () { pintarGrid(); gridEl.scrollTop = 0; });
    buscar.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && vista.length === 1) { e.preventDefault(); alternar(vista[0].n); pintarGrid(); }
    });
    solo.addEventListener("change", pintarSolo);
    pintarSel();
    // Si ya hay equipos guardados, se carga la lista de fondo para tener sus escudos al instante.
    if (elegidos.length) cargarClubes().then(pintarSel).catch(function () {});
    }


    var accion = panel.querySelector("#eofPushAccion");
    if (accion) accion.addEventListener("click", function () {
      var nuevas = {
        noticias: panel.querySelector("#eofPushNoticias").checked,
        partidos: panel.querySelector("#eofPushPartidos").checked,
        solo_clubes: !!(solo && solo.checked),
        clubes: elegidos.slice(),
      };
      if (!nuevas.noticias && !nuevas.partidos) { pintarPanel(activo, "Elige al menos un tipo de aviso.", "error"); return; }
      if (nuevas.solo_clubes && !nuevas.clubes.length) { pintarPanel(activo, "Elige al menos un equipo o desactiva \u00abSolo de mis equipos\u00bb.", "error"); return; }
      accion.disabled = true;
      accion.textContent = "Un momento\u2026";
      guardarPrefs(nuevas);
      activar(nuevas).then(function () {
        btn.dataset.activo = "1";
        pintarPanel(true, "Listo, avisos activados.", "ok");
      }).catch(function (err) {
        if (window.console && console.error) console.error("[push] no se pudo activar:", err);
        pintarPanel(activo, mensajeDeError(err), "error");
      });
    });
    var quitar = panel.querySelector("#eofPushQuitar");
    if (quitar) quitar.addEventListener("click", function () {
      quitar.disabled = true;
      desactivar().then(function () {
        delete btn.dataset.activo;
        pintarPanel(false, "Avisos desactivados.", "ok");
      }).catch(function (err) {
        if (window.console && console.error) console.error("[push] no se pudo desactivar:", err);
        pintarPanel(activo, mensajeDeError(err), "error");
      });
    });
  }

  btn.addEventListener("click", function () {
    if (!panel.hidden) { cerrarPanel(); return; }
    if (requiereInstalar) { pintarPanel(false); abrirPanel(); return; }
    suscripcionActual().then(function (sub) {
      var activo = !!sub && Notification.permission === "granted";
      pintarPanel(activo);
      abrirPanel();
    }).catch(function (err) {
      if (window.console && console.error) console.error("[push] no se pudo comprobar:", err);
      pintarPanel(false, mensajeDeError(err), "error");
      abrirPanel();
    });
  });
  fondo.addEventListener("click", cerrarPanel);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") cerrarPanel(); });

  // La campanita queda anclada: position:fixed en la esquina inferior izquierda,
  // siempre en el mismo sitio. (Antes se subia al llegar al pie de pagina; se
  // quito porque el boton se movia mientras se hacia scroll.)

  function montar() {
    document.body.appendChild(btn);
    document.body.appendChild(fondo);
    document.body.appendChild(panel);
    if (!requiereInstalar && Notification.permission === "granted") {
      suscripcionActual().then(function (sub) {
        if (sub) {
          btn.dataset.activo = "1";
          // Re-sincroniza por si el servidor perdio la suscripcion.
          enviarAlServidor(sub, leerPrefs()).catch(function () {});
        }
      }).catch(function () {});
    }
  }
  if (document.body) montar(); else document.addEventListener("DOMContentLoaded", montar);
})();
