# Sitemap dinámico de noticias (SEO)

## Problema

`public/sitemap.xml` es un archivo estático: solo lista páginas fijas
(portada, resultados, categorías). Las noticias individuales
(`noticia.html?slug=...`) dependen de la base de datos y no estaban en
ningún sitemap, así que Google solo podía descubrirlas siguiendo enlaces
internos desde la portada/categorías — más lento e incompleto, sobre todo
para noticias recién publicadas.

## Cambios

### 1. Worker principal (`worker/src/index.js`)

Nuevo endpoint público, sin autenticación:

```
GET /sitemap-noticias.xml
```

- Consulta `SELECT slug, fecha_publicacion, updated_at FROM articles WHERE publicado = 1`.
- Genera un XML válido de sitemap con una `<url>` por noticia publicada,
  usando `noticia.html?slug=...` (la URL real que ya usa el sitio) y
  `<lastmod>` cuando hay fecha disponible.
- Cacheado 1 hora (`Cache-Control: public, max-age=3600`): un sitemap no
  necesita estar al segundo, y así no se golpea la base de datos en cada
  rastreo de Google.
- Si la consulta a la base de datos falla, devuelve un sitemap vacío pero
  válido (200) en vez de un error 500, para no dar una respuesta "rota" a
  un rastreador que llegue justo en ese momento.

Este endpoint **no** pasa por el mecanismo de failover a Railway
(`fetchRailway`) que sí usan las rutas `/api/*`: si D1 falla justo en esta
consulta, el sitemap sale vacío esa vez en vez de reintentarse contra
Railway. Se ha dejado así a propósito, para no tocar la lógica de
failover (delicada) por un endpoint de solo lectura y baja criticidad —
un sitemap vacío durante unos minutos no pierde noticias ya indexadas,
solo retrasa el descubrimiento de las nuevas hasta el siguiente rastreo.

### 2. Worker secundario (`worker-secondary/src/index.js`)

Se ha replicado el mismo endpoint `GET /sitemap-noticias.xml` (con los
mismos helpers `escaparXml`/`fechaParaSitemap`) para que el código de
ambas APIs no diverja. **Aviso:** hoy esto no se usa en producción. El
único punto de entrada público real es siempre el worker principal
(`elotrofutbol.media` pasa por él); cuando D1 falla, es el propio worker
principal quien reenvía internamente la petición a Railway
(`fetchRailway`), pero el navegador/Google siguen hablando con
`elotrofutbol.media`, nunca directamente con el dominio de Railway. Este
endpoint en la secundaria solo cobraría sentido si algún día esa API se
expone ella misma con dominio/ruta pública propia.

### 3. `wrangler.toml` (worker principal)

Se añade una `[[routes]]` para que
`https://elotrofutbol.media/sitemap-noticias.xml` sirva ese endpoint.

**Importante:** el worker normalmente responde en
`elotrofutbol-api.adriamarch2010.workers.dev`, un dominio distinto al del
sitio (`elotrofutbol.media`). Un sitemap listado en `robots.txt` tiene
que servirse desde el **mismo dominio** que ese `robots.txt`, si no
Google no lo acepta como sitemap propio del sitio (o hay que verificarlo
aparte en Search Console como recurso externo, más frágil). Por eso se
expone solo esta única ruta en el dominio público, sin mover el resto de
la API ahí.

Esto requiere que `elotrofutbol.media` esté gestionado como zona en la
misma cuenta de Cloudflare que este Worker. Si no lo está (DNS en otro
proveedor), la alternativa es:

- Poner el sitio detrás de Cloudflare (cambiar los nameservers), o
- Servir `sitemap-noticias.xml` desde donde sea que se sirve `public/`
  hoy, haciendo que ese servidor reenvíe (proxy/rewrite) la petición al
  worker en vez de usar `[[routes]]` de Cloudflare.

### 4. `public/robots.txt`

Se añade una segunda línea `Sitemap:` (Google acepta varias) apuntando a
`https://elotrofutbol.media/sitemap-noticias.xml`, además de la ya
existente hacia `sitemap.xml`.

### 5. `public/sitemap.xml`

Se actualiza el comentario de cabecera: ya no dice que generar el
sitemap de noticias "queda fuera de esta fase", sino que ahora vive en
`/sitemap-noticias.xml`.

## Pendiente / recomendado

- Desplegar (`wrangler deploy`) y comprobar en el navegador que
  `https://elotrofutbol.media/sitemap-noticias.xml` responde 200 con XML
  válido y las noticias esperadas.
- Dar de alta (si no está ya) el dominio en Google Search Console y
  enviar ahí ambos sitemaps para monitorizar indexación real.
- A medio plazo: el contenido de `noticia.html` se rellena por completo
  con JavaScript tras cargar la página (ver `noticia.html` /
  `js/seo.js`), lo que retrasa la indexación frente a servir el HTML ya
  renderizado (SSR/prerender) para cada noticia. Este sitemap ayuda a que
  Google *descubra* las URLs antes, pero no cambia cómo de rápido las
  *indexa* una vez las visita.
