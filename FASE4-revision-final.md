# Fase 4 — Revisión final (repaso cruzado de Fases 1-3)

## Resultado de la revisión

He repasado backend (worker/src/index.js), admin (admin.js + panel.html) y
frontend (seo.js + las 6 páginas públicas) buscando inconsistencias entre
fases. **No he encontrado bugs que requieran parche.** El criterio de
"traducción completa" (`título && contenido`) está centralizado y es
*idéntico* en los tres sitios donde se usa:

- Backend: `idiomaCompleto()` (línea 53) — usada tanto al guardar
  (`extraerTraducciones`) como al leer (`conIdiomasDisponibles`).
- Admin: `traduccionIdiomaCompleta()` (admin.js línea 860) — mismo criterio,
  con comentario explícito de que debe coincidir con el backend.
- Frontend público: `noticia.html` recalcula lo mismo como fallback por si
  `idiomas_disponibles` no viniera en el JSON (p. ej. en modo preview, que
  no pasa por la API).

El endpoint `GET /api/articles/:slug` sí aplica `conIdiomasDisponibles`
antes de devolver el artículo (lo comprobé línea por línea porque es el
punto de unión más frágil entre Fase 1 y Fase 3), así que `noticia.html`
recibe la lista ya calculada por el servidor en el caso normal.

Los avisos de traducciones a medias (`avisos_traduccion`) también viajan
completos: el backend los genera en `extraerTraducciones`, los devuelve en
la respuesta de `POST`/`PUT /api/articles`, y `admin.js` los pinta en
`#avisosTraduccionGuardado` (el elemento existe en `panel.html`, confirmado).

## Limpieza aplicada

No ha hecho falta tocar código: las tres fases ya comparten funciones y
comentarios cruzados apuntando de una a otra (p. ej. seo.js referencia el
mismo criterio de idiomas que index.js). No he añadido comentarios
redundantes ni renombrado nada para no introducir riesgo sin necesidad.

## Pendiente fuera de esta fase (backend)

`sitemap.xml` ya trae un comentario dejando esto documentado: las noticias
individuales no están porque dependen de la base de datos. Como comentas,
hace falta un endpoint en el worker (algo como `GET /sitemap-noticias.xml`
que consulte `/api/articles` y genere el XML al vuelo, o un job que
regenere `sitemap.xml` periódicamente) para que Google indexe las noticias
eficientemente. Lo dejo anotado para cuando abordéis esa pieza de backend.

## Checklist de pruebas manuales

### SEO — páginas estáticas
- [ ] Portada, categoría, resultados, buscador, autor: `<title>` y meta
      description cambian según la página/parámetros.
- [ ] `buscar.html` lleva `<meta name="robots" content="noindex">` y
      además está en `Disallow` en `robots.txt` (doble barrera, correcto).
- [ ] `categoria.html?cat=X&club=Y`: comprobar que el canonical no genera
      contenido duplicado real entre páginas de club muy similares (revisar
      con Search Console cuando haya tráfico, no bloqueante ahora).

### SEO — noticia.html (el caso complejo)
- [ ] Abrir una noticia con las 4 traducciones completas: el selector de
      idioma muestra los 4 botones activos + castellano.
- [ ] Cambiar de idioma con los botones: `<html lang>`, `<title>`, meta
      description, canonical, `og:locale` y el JSON-LD se actualizan sin
      recargar la página.
- [ ] Ver código fuente (`Ctrl+U`, no DOM inspector) tras cambiar idioma:
      confirmar que no hay etiquetas `hreflang` duplicadas.
- [ ] Idioma sin traducir (p. ej. `en` a medias): el botón sale
      deshabilitado, al hacer clic no navega y no se pinta como disponible.
- [ ] `?lang=ca` en la URL al entrar directo: se respeta como idioma
      inicial si está disponible.
- [ ] Modo preview (`?preview=1` desde el panel): confirmar
      `noindex, nofollow` y que NO se generan canonical/hreflang/JSON-LD
      reales (la función corta antes con el `if (!ES_PREVIEW)`).
- [ ] Noticia sin slug o slug inexistente: `noindex` + página de error, sin
      restos de metadatos de una noticia anterior si se navega entre dos
      noticias en la misma sesión (SPA-like).

### Admin — indicador de traducciones
- [ ] Escribir solo el título en un idioma (sin contenido): aparece aviso
      "Falta contenido" en el panel y el punto de la pestaña queda en
      "parcial" (ámbar), no en "completo" (verde).
- [ ] Completar título + contenido: el punto pasa a verde y el contador
      global sube ("N de 4 idiomas completos") junto con la barra.
- [ ] Guardar con una traducción a medias: el aviso que devuelve el
      backend (`avisos_traduccion`) se muestra tras guardar, y el campo
      efectivamente se guardó como `NULL` en los tres campos de ese idioma
      (comprobable reabriendo el artículo: el panel de ese idioma vuelve
      vacío, no "a medias").
- [ ] Cargar para editar un artículo ya publicado con 2 de 4 idiomas
      completos: el indicador de progreso arranca ya en "2 de 4" al abrir,
      sin necesidad de tocar el teclado primero.

### Integridad backend (Fase 1 en producción real)
- [ ] Confirmar en D1 que ningún artículo tiene, por ejemplo,
      `contenido_en` relleno con `titulo_en` a NULL (el estado huérfano que
      la Fase 1 debía impedir). Si hay artículos antiguos previos a esta
      lógica, conviene una consulta puntual de comprobación antes de dar
      por cerrado el checklist.
