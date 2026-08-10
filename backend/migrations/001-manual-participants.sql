-- Adds the two columns behind creator-edited leaderboards.
--
-- schema.sql is written for a database that does not exist yet; this is for one that already does.
-- Both defaults are zero, so every existing participant carries on exactly as before: no adjustment,
-- and not manual.
--
-- Run once, against each deployment:
--   wrangler d1 execute botw --remote --file migrations/001-manual-participants.sql
--
-- If that fails on the API's import endpoint, run the two statements separately with --command; the
-- result is the same, and ALTER TABLE ... ADD COLUMN is its own transaction either way.

ALTER TABLE participants ADD COLUMN adjustment INTEGER NOT NULL DEFAULT 0;
ALTER TABLE participants ADD COLUMN manual INTEGER NOT NULL DEFAULT 0;
