-- The like a card actually shows (owner decision 2026-09-27). Additive only.
--
-- On its own, ahead of the migration that adds the bookmark table: an
-- `ALTER TYPE ... ADD VALUE` may not be used by any statement in the same
-- transaction, and keeping it alone means nothing can start doing so by
-- accident.
ALTER TYPE "CardReactionType" ADD VALUE 'LIKE';
