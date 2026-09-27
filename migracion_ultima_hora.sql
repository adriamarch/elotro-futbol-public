-- Migración: banner "Última hora" en portada
-- El código del worker (worker/src/index.js y worker-secondary/src/index.js)
-- ya usa las columnas banner_urgente / banner_urgente_hasta desde antes de
-- esta sesión, pero la migración nunca se llegó a ejecutar contra D1: por
-- eso cualquier UPDATE/SELECT que las mencione (p. ej. el PUT de editar
-- noticia) falla con "columna no existe" y el worker lo traduce en un 404
-- genérico de "Noticia no encontrada".
--
-- Ejecutar en el D1 de producción:
--   npx wrangler d1 execute elotrofutbol --remote --file=migracion_ultima_hora.sql
--
-- Si worker-secondary usa Postgres (ver postgres-db.js/sql-compat.js),
-- hay que aplicar el equivalente ahí también con su propia herramienta,
-- no con este mismo comando de wrangler.

ALTER TABLE articles ADD COLUMN banner_urgente INTEGER NOT NULL DEFAULT 0;
ALTER TABLE articles ADD COLUMN banner_urgente_hasta TEXT;

-- Índice para que el SELECT del endpoint público no escanee toda la tabla.
CREATE INDEX IF NOT EXISTS idx_articles_banner_urgente ON articles(banner_urgente, banner_urgente_hasta);
