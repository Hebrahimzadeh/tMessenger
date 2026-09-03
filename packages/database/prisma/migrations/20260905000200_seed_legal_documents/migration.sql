-- Seed an initial, effective version 1 of TERMS and PRIVACY (Task 05:
-- GET /v1/legal/current needs at least one effective version of each to
-- return anything). publicUrl is a *relative* path, deliberately - the API
-- resolves it against APP_ORIGIN at read time (see
-- legal-document.service.ts), so this seed stays environment-agnostic.
--
-- contentHash is a placeholder, NOT a hash of real legal text: authoring the
-- actual terms-of-service/privacy-policy copy is outside this task's scope
-- (infrastructure, not legal content). Whoever publishes the real text must
-- insert a new version 2 row (never rewrite this one - see
-- terms_acceptances' FK to (type, version), which makes every published
-- version immutable by construction) with a real contentHash of that text.
--
-- Fixed ids and ON CONFLICT DO NOTHING make this idempotent - safe to re-run.
INSERT INTO "legal_document_versions"
    ("id", "type", "version", "contentHash", "publicUrl", "effectiveAt", "createdAt", "updatedAt")
VALUES
    ('a3f3a1f2-5a35-4c33-9f0b-8f6a1a2b3c01', 'TERMS', 1, 'placeholder-not-real-content-hash-v1',
     '/legal/terms/v1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('a3f3a1f2-5a35-4c33-9f0b-8f6a1a2b3c02', 'PRIVACY', 1, 'placeholder-not-real-content-hash-v1',
     '/legal/privacy/v1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("type", "version") DO NOTHING;
