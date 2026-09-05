-- AlterTable
ALTER TABLE "spaces" ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '';

-- Trigram similarity search - not expressible in schema.prisma (no
-- gin_trgm_ops index type), added by hand. Works language-agnostically on
-- character trigrams, so it needs no Persian-specific text-search
-- configuration/dictionary (Postgres ships none by default) the way
-- to_tsvector-based full-text search would.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "spaces_search_text_trgm_idx" ON "spaces" USING GIN ("searchText" gin_trgm_ops);
