# Deploy runbook (M0)

Everything here is `docker compose`-based: build the images, bring the stack
up, watch the status page. Nothing in this file is specific to a particular
host - it just needs Docker and Docker Compose installed.

## First deploy

1. Copy `.env.example` to `.env` at the repo root and fill in every value.
   `SESSION_HMAC_KEY` and `PHONE_ENCRYPTION_KEY` are the two the stack will
   refuse to start without (see `services/api/src/config/env.ts`) - generate
   real random values for them, e.g.:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. Build the images:

   ```bash
   docker compose build
   ```

3. Start the stack:

   ```bash
   docker compose up -d
   ```

4. Watch it come up:

   ```bash
   docker compose ps
   docker compose logs -f
   ```

   `object-storage-init` exits 0 once it's created the app's bucket (it's a
   one-shot job, not a long-running service - a `restart: unless-stopped`
   loop there would be a bug, not a feature).

5. Smoke-test:

   - `http://<host>/` - the app shell.
   - `http://<host>/system-status` - live API/DB/Redis/storage status.

## Environment variables

See `.env.example` for the full list. Two categories:

- **Has a sensible local default** (`POSTGRES_PASSWORD`, `S3_BUCKET`,
  `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `APP_ORIGIN`, the `*_PORT` overrides):
  fine to leave as-is for a single-host deploy, but change them for
  anything internet-facing.
- **No default, deploy fails without it** (`SESSION_HMAC_KEY`,
  `PHONE_ENCRYPTION_KEY`): `docker-compose.yml` uses Compose's
  `${VAR:?message}` syntax for these specifically, so `docker compose up`
  itself refuses to start rather than silently booting with an empty value -
  the app's own `env.ts` fail-fast is the second line of defense once the
  API process actually starts.

No secret is ever baked into an image or passed as a build argument - both
Dockerfiles only take `NEXT_PUBLIC_API_BASE_URL` as a build arg (the public
API path, not a credential), and every credential above is a runtime
environment variable injected by Compose.

## Rolling back

Compose doesn't version images by itself, so rollback here means: rebuild
from a known-good commit and redeploy.

```bash
git checkout <previous-good-sha>
docker compose build
docker compose up -d
```

Database migrations are forward-only (see the plan's Global Constraints:
"migration اعمال‌شده را rewrite نکن؛ migration جدید بساز") - rolling back
application code does not roll back the schema. As of M0 the only tables
are `system_settings` and `outbox_events`, so this has no real consequence
yet; it will matter once real domain migrations exist; that will need
review at the point it becomes practically relevant.

## Logs and secrets

`docker compose logs` must never show a secret value or a raw env dump.
Verified for this milestone by inspecting `docker compose logs api` after a
full `up` - the only values that appear are non-secret operational fields
(status codes, response times, correlation-adjacent request ids); see
`docs/reviews/task-04.md` for the actual command and result.

## Stopping / tearing down

```bash
docker compose down          # stop and remove containers, keep volumes (data survives)
docker compose down -v       # also remove volumes (data loss - Postgres, Redis, object storage)
```
