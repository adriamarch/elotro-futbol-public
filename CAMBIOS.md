# Cambios realizados

## 1. Logo de LaLiga Hypermotion en dark mode (panel de admin → Resultados)
Archivos: `public/admin/panel.html`, `public/admin/admin.css`, `public/admin/js/admin.js`

- El logo grande de la cabecera del formulario de "+ Nuevo resultado / Editar"
  y el mini-logo de cada fila en "Ver resultados" ahora se pintan en blanco
  en modo oscuro (mismo criterio que ya usaba `categoria.html` en el sitio
  público: `filter: brightness(0) invert(1)`, solo para Hypermotion).

## 2. Quitar "🔴 Sin cubrir" si ya hay eventos siendo registrados
Archivos: `worker/src/index.js`, `public/admin/js/admin.js`

- El endpoint `GET /api/results` ahora añade `ultimo_evento_at` (el instante
  del último evento del minuto a minuto) a cada partido en juego.
- El aviso "Sin cubrir" ya no aparece si se ha registrado un evento en los
  últimos 5 minutos, aunque el cronómetro lleve mucho corriendo sin pitar
  descanso/final.

## 3. Modal de newsletter (dos apariciones)
Archivos: `public/js/layout.js`, `public/css/style.css`

- Modal nuevo que reutiliza el endpoint ya existente
  `POST /api/newsletter/suscribir`.
- Se muestra la primera vez a los 4s de cargar la página, y una segunda vez
  pasados 45s en una visita posterior (nunca más de 2 veces, nunca si ya
  se suscribió). Estado guardado en `localStorage` (`eof_newsletter_modal`).
- Cierre con ✕, clic fuera, tecla Escape, o "Ahora no, gracias".
- No se solapa si el modal de detalle de partido ya está abierto.

---

**Nota:** este ZIP no incluye `worker/node_modules` ni `worker-secondary/`
(no se han tocado). Para desplegar el worker, copia `worker/src/index.js`
sobre tu proyecto y haz `npm install` si no tienes ya las dependencias.
