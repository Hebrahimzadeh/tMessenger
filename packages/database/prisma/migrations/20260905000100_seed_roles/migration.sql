-- Seed the fixed role vocabulary (docs/*-mvp-sonnet5.md Task 05). Fixed ids
-- and ON CONFLICT DO NOTHING make this idempotent - safe to re-run, and safe
-- if a future migration ever needs to reference one of these rows by id.
INSERT INTO "roles" ("id", "key", "displayName", "createdAt", "updatedAt") VALUES
    ('f77efe22-5b5f-4368-988e-496b66b32bda', 'USER', 'کاربر', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ce819b1b-fff0-4dc4-b216-f3417e4891d5', 'SPACE_ADMIN', 'مدیر زیربستر', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('09283d71-8ce2-431e-a827-0fba0480f26c', 'MODERATOR', 'ناظر', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('2394c480-0574-480c-8c78-5f6a48564e6d', 'SENIOR_ADMIN', 'مدیر ارشد', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('48bb38d4-66cb-4db8-934c-cc4cf505ae1a', 'SUPERADMIN', 'مدیر کل', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('f6c23db0-c8b9-4733-81e1-c657883f63a3', 'OPS', 'عملیات', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
