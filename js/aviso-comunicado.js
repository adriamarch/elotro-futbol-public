/* Aviso del comunicado oficial FIJADO en la portada. Lee /api/comunicados/fijado; si no hay ninguno
   (o falla la red) no pinta nada. Todo se escribe con textContent. El lector puede cerrarlo y no
   vuelve a salir para ese mismo comunicado en ese navegador. */
(function () {
  "use strict";
  var cont = document.getElementById("avisoComunicado");
  if (!cont || typeof apiFetch !== "function") return;
  var CLAVE = "eof-aviso-comunicado-cerrado";
  function cerrado(slug) { try { return localStorage.getItem(CLAVE) === slug; } catch (_) { return false; } }
  function recordar(slug) { try { localStorage.setItem(CLAVE, slug); } catch (_) { /* sin almacenamiento */ } }
  var TIPOS = { comunicado: "Comunicado", aviso: "Aviso", rectificacion: "Rectificación", novedad: "Novedad" };

  apiFetch("/api/comunicados/fijado").then(function (res) {
    return res.ok ? res.json() : null;
  }).then(function (d) {
    var c = d && d.item;
    if (!c || !c.slug || !c.titulo || cerrado(c.slug)) return;
    var caja = document.createElement("div");
    caja.className = "aviso-com aviso-com-" + (TIPOS[c.tipo] ? c.tipo : "comunicado");
    caja.setAttribute("role", "region");
    caja.setAttribute("aria-label", "Comunicado oficial");
    var a = document.createElement("a");
    a.className = "aviso-com-enlace";
    a.href = "/comunicados/" + encodeURIComponent(c.slug);
    var ico = document.createElement("span");
    ico.className = "aviso-com-icono";
    ico.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
    var texto = document.createElement("span");
    texto.className = "aviso-com-texto";
    var tipo = document.createElement("strong");
    tipo.className = "aviso-com-tipo";
    tipo.textContent = TIPOS[c.tipo] || "Comunicado";
    var tit = document.createElement("span");
    tit.className = "aviso-com-tit";
    tit.textContent = c.titulo;
    texto.appendChild(tipo);
    texto.appendChild(tit);
    var leer = document.createElement("span");
    leer.className = "aviso-com-leer";
    var lt = document.createElement("span");
    lt.textContent = "Leer";
    leer.appendChild(lt);
    leer.insertAdjacentHTML("beforeend", '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>');
    a.appendChild(ico);
    a.appendChild(texto);
    a.appendChild(leer);
    var x = document.createElement("button");
    x.type = "button";
    x.className = "aviso-com-cerrar";
    x.setAttribute("aria-label", "Cerrar aviso");
    x.textContent = "×";
    x.onclick = function () { recordar(c.slug); caja.remove(); };
    caja.appendChild(a);
    caja.appendChild(x);
    cont.appendChild(caja);
  }).catch(function () { /* sin aviso */ });
})();
