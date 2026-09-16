# Fase 1 — Diseño, CSS y responsive (resumen de cambios)

## public/css/style.css
- Reorganizado con un índice de secciones al principio del archivo.
- Nuevos tokens: `--ancho-web`, `--ancho-lectura`, `--rapido`, `--radio-lg`, `--sombra-lg`.
- Accesibilidad: `:focus-visible` en toda la web (enlaces, botones, campos),
  `prefers-reduced-motion` respetado, clase `.solo-lectores` para texto
  solo para lectores de pantalla.
- Responsive de tres franjas reales en vez de dos:
  - **Tablet (≤1024px)**: cuadrícula de noticias más ajustada, hero más
    compacto, destacadas secundarias en 2 columnas, pie de página en 3
    columnas.
  - **Móvil (≤900px / ≤600px)**: el existente, revisado.
  - **Móvil pequeño (≤380px)**: nuevo, para iPhone SE y similares.
- Nuevas clases `.cabecera-club` / `.escudo-club` (antes eran estilos
  inline en `categoria.html`).
- Añadido color al icono de la página 404 (antes en `style=""` inline).

## public/admin/css/admin.css (nuevo archivo)
- Se ha extraído aquí el bloque `<style>` de 1075 líneas que estaba
  incrustado en `admin/panel.html`. El panel ahora carga
  `<link rel="stylesheet" href="css/admin.css">` en vez de tener el CSS
  mezclado con el HTML.
- Añadida una franja responsive de tablet (≤1024px) que no existía: antes
  el panel saltaba directamente de escritorio al modo "tarjeta" de móvil
  a 780px.
- ~25 clases de utilidad nuevas (`u-mt8`, `u-ancho-completo`,
  `u-mensaje-error`, etc.) que sustituyen a los estilos inline sueltos
  que tenía `panel.html` (de 84 a 13; los 13 restantes son estados que
  cambia `admin.js` dinámicamente y se han dejado intactos por prudencia,
  ya que tocar esa parte es trabajo de Fase 2).

## HTML público
- `categoria.html`, `autor.html`, `contenido.html`: estilos inline
  estáticos (`style="display:none"`) sustituidos por el atributo `hidden`,
  más semántico; el JS correspondiente actualizado.
- `resultados.html`: añadida accesibilidad a los filtros de competición
  (`role="group"`, `aria-pressed`).
- `noticia.html`: el "Cargando..." de texto plano ahora usa el mismo
  spinner que el resto de la web.
- `404.html`: quitado el último estilo inline.

## admin/login.html
- Mensajes de error/éxito de los 4 formularios (login, olvido de
  contraseña, confirmación de nueva contraseña, correo inicial) unificados
  en las clases `.mensaje-form.error` / `.mensaje-form.ok`.
- Añadido un punto de ruptura responsive para pantallas muy pequeñas
  (≤460px).
- Los toggles de mostrar/ocultar los distintos formularios ahora usan
  `hidden` de forma consistente (antes mezclaba `style.display` con
  atributos, con riesgo de conflicto de especificidad).

## Qué NO se ha tocado todavía (Fase 2)
- La lógica interna de `admin.js` (4200 líneas) y `worker/src/index.js`
  (2200 líneas): revisión de código, limpieza y posibles mejoras de
  estructura, pendiente.
- `contenido.html` tiene su propio bloque `<style>` con una versión algo
  duplicada de los estilos de "subir archivos" que también existen en
  `admin.css`; no está roto, pero es candidato a unificar en la Fase 2
  para no mantener el mismo CSS por partida doble.
