-- One-prompt space building (owner decision 2026-09-17). Additive only.
--
-- A new capability value, so every AI request that builds a space is
-- recorded under its own name rather than borrowing SPACE_GUIDANCE, which
-- answers a different question and would muddy both the audit trail and
-- per-capability usage.
ALTER TYPE "AiCapability" ADD VALUE 'SPACE_BUILD';
