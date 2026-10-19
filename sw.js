// Service worker de ELOTROFUTBOLTV.
// Solo gestiona notificaciones push: NO intercepta peticiones (no hay
// handler "fetch"), asi que no cachea nada ni puede dejar contenido viejo
// a nadie. Cada deploy sirve siempre lo ultimo.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch (e) {
    datos = { titulo: "ElOtroFútbol", cuerpo: event.data ? event.data.text() : "" };
  }
  const titulo = datos.titulo || "ElOtroFútbol";
  const opciones = {
    body: datos.cuerpo || "",
    // ?v=2: fuerza a los navegadores a olvidar el icono anterior que tuvieran en cache.
    icon: datos.icono || "/img/icon-192.png?v=2",
    badge: "/img/push-badge-96.png?v=2",
    // Misma "tag" = la notificacion nueva sustituye a la anterior (p. ej.
    // varios goles del mismo partido no se apilan).
    tag: datos.tag || undefined,
    renotify: !!datos.tag,
    data: { url: datos.url || "/" },
  };
  if (datos.imagen) opciones.image = datos.imagen;
  event.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destinoUrl = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
  const destino = destinoUrl.href;
  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const v of ventanas) {
      if (v.url === destino && "focus" in v) return v.focus();
    }
    // Aviso del panel de redaccion (?ir=<seccion>): si el panel ya esta abierto en
    // alguna ventana, se le avisa para que abra la pestana, sin recargarlo ni
    // pisar otra pagina del sitio.
    if (destinoUrl.pathname === "/admin/panel.html") {
      const ir = destinoUrl.searchParams.get("ir");
      for (const v of ventanas) {
        let u;
        try { u = new URL(v.url); } catch (e) { continue; }
        if (u.pathname === destinoUrl.pathname && "focus" in v) {
          if (ir) v.postMessage({ tipo: "staff-ir", ir });
          return v.focus();
        }
      }
    }
    for (const v of ventanas) {
      if ("navigate" in v && "focus" in v) {
        await v.navigate(destino);
        return v.focus();
      }
    }
    return self.clients.openWindow(destino);
  })());
});

// Si el navegador renueva la suscripcion por su cuenta, se vuelve a
// registrar en el servidor con las mismas preferencias.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    try {
      const claveRes = await fetch("https://api.elotrofutbol.media/api/push/clave");
      const { clave } = await claveRes.json();
      const relleno = "=".repeat((4 - (clave.length % 4)) % 4);
      const bin = atob((clave + relleno).replace(/-/g, "+").replace(/_/g, "/"));
      const key = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      try {
        await fetch("https://api.elotrofutbol.media/api/push/suscribir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // "heredar": el servidor copia noticias/partidos/equipos de la suscripcion
          // anterior (aqui no se conocen las preferencias) y la sustituye.
          body: JSON.stringify({
            suscripcion: sub.toJSON(), noticias: true, partidos: true,
            endpoint_anterior: event.oldSubscription ? event.oldSubscription.endpoint : undefined,
            heredar: !!event.oldSubscription,
          }),
        });
      } catch (e) { /* la renovacion de equipo de abajo se intenta igualmente */ }
      // Avisos del panel de redaccion: si la suscripcion anterior estaba dada de alta
      // como dispositivo del equipo, el servidor la sustituye por la nueva (sin sesion:
      // solo vale si se conoce el endpoint anterior). Si no era de equipo, no hace nada.
      if (event.oldSubscription && event.oldSubscription.endpoint) {
        try {
          await fetch("https://api.elotrofutbol.media/api/staff-push/renovar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ suscripcion: sub.toJSON(), endpoint_anterior: event.oldSubscription.endpoint }),
          });
        } catch (e) { /* sin red: se reactiva desde la campanita */ }
      }
    } catch (e) { /* sin red: la proxima visita a la web lo reintenta */ }
  })());
});
