# TMessenger deployment — UI preview

Public URL: `https://tmessenger.taavonafarin.ir`
SSH: `root@185.252.29.27`, port `2727`.
Release: `/opt/tmessenger/releases/20260911-5797505`.
Runtime settings: `/opt/tmessenger/shared/.env` (mode `0600`, root only).

## Current behavior

The domain now serves the new TMessenger web container in UI preview mode.
The home, chats, chat detail, and comments screens use the project's existing
browser-local sample data. A visible banner identifies the preview. Admin,
profile, security, and other real account pages retain their login checks.
Preview is explicitly enabled with `UI_PREVIEW_MODE=true`; the default is off.

SMS settings are deliberately unset per the owner's request. The production
API remains stopped. The Docker proxy returns an explicit 503 preview response
for `/api/*` and `/socket.io/*`; it does not simulate successful login or service
availability. Local UI interactions do not create production accounts or data.

## Docker services and routing

All application services are Docker Compose services in project `tmessenger`:
web, proxy (Caddy), PostgreSQL, Redis, object storage, migration job, and worker.
The API image is built and ready for later configuration. Database and Redis
have no published host ports. Published project ports are loopback-only.

```text
HTTPS tmessenger.taavonafarin.ir
  -> existing shared host nginx (TLS, also serves unrelated websites)
  -> 127.0.0.1:18880 -> tmessenger-proxy Docker container
  -> web:3000 / object-storage:9000 on the project's private Docker network
```

The shared host nginx and certificate-renewal infrastructure stay in place to
preserve the server's other sites. They are the only host-level infrastructure
used by this deployment. App and storage routing lives in the Docker proxy.

The old Site Manager route still points to its `taavon` container internally.
The exact nginx virtual host for this domain now takes precedence and forwards
to the new Docker proxy, so it cannot accidentally serve the old application.
The old container is retained for rollback; no unrelated site was removed.

## Operate the preview

In the release directory:

```sh
DC='docker compose --env-file /opt/tmessenger/shared/.env -f deploy/compose.production.yml'
$DC config --quiet
$DC build object-storage
$DC build migrate
$DC build web
$DC up -d web proxy worker
$DC ps -a
```

Preview settings in the protected environment file:

```dotenv
UI_PREVIEW_MODE=true
PROXY_CONFIG=/opt/tmessenger/releases/20260911-5797505/deploy/Caddyfile.preview
```

Do not run an unrestricted `up -d` until SMS configuration is supplied, because
it also starts the production API, which intentionally rejects missing SMS.
Never print the environment file or resolved Compose configuration with secrets.

## Activate real services later

Configure the actual SMS adapter and change the preview settings:

```dotenv
SMS_PROVIDER_WEBHOOK_URL=https://your-real-adapter/send-otp
SMS_PROVIDER_API_KEY=your-real-key
UI_PREVIEW_MODE=false
PROXY_CONFIG=/opt/tmessenger/releases/20260911-5797505/deploy/Caddyfile.production
```

The adapter must accept `POST {"phoneE164":"...","code":"..."}` with a Bearer
key and return success only when delivery is accepted. Example credentials are
not usable. No real SMS is sent by the deployment validation.

Then run:

```sh
bash deploy/activate-production.sh --check
bash deploy/activate-production.sh
```

The runtime preview switch does not require another image build. The activation
script validates production settings, starts the stack, checks dependency
readiness, and validates HTTPS routing. Both web and API use the same session
signing key. The phone encryption key must not be rotated without a data migration.

## Certificates and rollback

The dedicated certificate is valid through 2026-12-09; its scheduled renewal
check and a simulated renewal both succeeded. Its host timer is
`tmessenger-certificate-renewal.timer`, independent of application restarts.

The pre-preview routing backup is:
`/opt/tmessenger/shared/https.before-preview.nginx.conf`.
Restore it to `/etc/nginx/sites/tmessenger.https.nginx.conf`, run `nginx -t`, then
reload nginx to return this domain to the old Site Manager frontend. Application
rollback does not roll back database migrations. Never run `down -v` unless
intentionally destroying the application's data.

## Verification — 2026-09-11

- 37 routing/session tests pass, including preview-off login and protected pages.
- The production web build passes without production secrets in the image.
- `/`, `/chats`, and `/comments` return 200 via the public Docker proxy.
- Browser navigation across those three screens succeeds with no JavaScript errors.
- All 12 migrations completed. Both daily worker jobs have run successfully.
- Private storage upload, HTTPS signed download, anonymous denial, and cleanup pass.
- API requests in preview return a clear 503; SMS credentials remain unset.

The storage container uses unchanged vendor binaries pinned by digest on Alpine
because the vendor base image requires CPU instructions absent on this server.
Upstream reference: https://github.com/minio/minio/issues/18365.
