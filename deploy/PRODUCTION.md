# TMessenger deployment — test environment

Public URL: `https://tmessenger.taavonafarin.ir`
SSH: `root@185.252.29.27`, port `2727`.
Release: `/opt/tmessenger/releases/20260919-6e13987` (Tasks 1-25, plus the
deployment fixes below).
Runtime settings: `/opt/tmessenger/shared/.env` (mode `0600`, root only).
Previous release kept for rollback: `20260918-e6dcc01`, and
`20260911-5797505` (UI preview) before it.

## Current behaviour

The full stack runs: web, API, worker, PostgreSQL, Redis, object storage and
the Docker proxy. UI preview mode is off — this is the real application
against a real database, not sample data.

**Anyone can log in as any phone number.** There is no SMS gateway, so the
API runs with `ALLOW_TEST_LOGIN_WITHOUT_SMS=true`, which keeps the dev OTP
sink and the `/v1/auth/otp/_dev-sink` route that reads codes back out of it.
The login screen calls that route and fills the code in by itself. This is a
deliberate hole, chosen by the owner for a test deployment with no real
accounts on it, and it must be closed before anyone real signs up — see
"Switch to real SMS" below. The API prints a `[SECURITY]` warning on every
boot while it is open.

`NODE_ENV` stays `production` regardless, so session cookies keep `Secure`
and the secret-strength checks still run. Enabling test login does not soften
anything else.

AI features run with **no model provider**. Google's Generative Language API
returns HTTP 403 to this server on geographic grounds, and the same block
applies from Iran generally, so `GEMINI_API_KEY` is deliberately unset. Every
capability answers from its rule-based fallback, which is a supported way to
run: space guidance still classifies and gates, card inference still picks a
kind and a behaviour, and the interface says plainly that no model wrote the
suggestion. See "Enable AI later".

## Docker services and routing

All application services are Docker Compose services in project `tmessenger`.
Database and Redis publish no host ports; every published project port is
loopback-only.

```text
HTTPS tmessenger.taavonafarin.ir
  -> existing shared host nginx (TLS, also serves unrelated websites)
  -> 127.0.0.1:18880 -> tmessenger-proxy Docker container
  -> web:3000, api:4000, object-storage:9000 on the project's private network
```

The shared host nginx and its certificate renewal stay in place for the
server's other sites; they are the only host-level infrastructure this
deployment uses. Site Manager on the parent domain is untouched — its four
containers and its own compose project are unchanged, and this domain's
nginx virtual host takes precedence for this exact hostname only.

## Operate

```sh
cd /opt/tmessenger/releases/20260917-0e9b3b3
DC='docker compose --env-file /opt/tmessenger/shared/.env -f deploy/compose.production.yml'
$DC ps
$DC logs -f api
$DC up -d            # full stack, including the API
```

Never print the environment file or `$DC config` output: both contain secrets.

## Deploying a new release

```sh
# On a workstation, from the repo root:
TAG=$(date +%Y%m%d)-$(git rev-parse --short HEAD)
git archive --format=tar.gz -o /tmp/t-$TAG.tar.gz HEAD
scp -P 2727 /tmp/t-$TAG.tar.gz root@185.252.29.27:/tmp/

# On the server:
mkdir -p /opt/tmessenger/releases/$TAG
tar -xzf /tmp/t-$TAG.tar.gz -C /opt/tmessenger/releases/$TAG
E=/opt/tmessenger/shared/.env
sed -i "s|^RELEASE_TAG=.*|RELEASE_TAG=$TAG|" $E
sed -i "s|^PROXY_CONFIG=.*|PROXY_CONFIG=/opt/tmessenger/releases/$TAG/deploy/Caddyfile.production|" $E
cd /opt/tmessenger/releases/$TAG
DC="docker compose --env-file $E -f deploy/compose.production.yml"
$DC build object-storage migrate web
$DC up -d
```

Migrations run automatically as the `migrate` service before the API starts,
and are forward-only. Rolling application code back does not roll the schema
back.

## Switch to real SMS

Put a real gateway in the environment file and drop the test-login flag:

```dotenv
SMS_PROVIDER_WEBHOOK_URL=https://your-adapter/send-otp
SMS_PROVIDER_API_KEY=your-real-key
ALLOW_TEST_LOGIN_WITHOUT_SMS=false
```

Then `$DC up -d api`. No rebuild is needed. A configured gateway wins over
the flag even if it is left set, so the hole cannot stay open by accident,
but removing it is still the right thing to do. The adapter must accept
`POST {"phoneE164":"...","code":"..."}` with a Bearer key and report success
only when delivery is accepted.

## Enable AI later

`GEMINI_API_KEY` in the environment file, then `$DC up -d api`. No rebuild.
Two things stand in the way today:

- **Geographic block.** `generativelanguage.googleapis.com` answers HTTP 403
  to this server. Reaching it needs an outbound proxy; the server already runs
  a `mihomo` client for Site Manager, but wiring the API through it is a
  change nobody has designed yet.
- **Model retirement.** `gemini-2.0-flash`, which the provider shipped with,
  now answers 404 ("no longer available ... use models/gemini-3.6-flash").
  The default is updated, and `GEMINI_MODEL` overrides it from the
  environment when the next one retires.

`AI_DAILY_BUDGET_MICROS` sets a daily ceiling in micros across everyone.

## Admin access

No superadmin is bootstrapped. To create one, put the phone number in
`BOOTSTRAP_SUPERADMIN_PHONE` in the environment file and run, from a release
directory, `docker compose ... run --rm api npm run bootstrap:superadmin`.
The account then has to enrol TOTP at `/settings/security` before `/admin`
will let it in.

## Certificates and rollback

The certificate for this hostname renews on its own host timer,
`tmessenger-certificate-renewal.timer`, independent of application restarts.

Routing backup from before the first deployment:
`/opt/tmessenger/shared/https.before-preview.nginx.conf`. Restore it to
`/etc/nginx/sites/tmessenger.https.nginx.conf`, run `nginx -t`, then reload
nginx to return this domain to the old Site Manager frontend.

To roll the application back, point `RELEASE_TAG` and `PROXY_CONFIG` at
`20260911-5797505` and `$DC up -d`; its images are still on the host. Never
run `down -v` unless you intend to destroy the application's data.

## Verification — 2026-09-17

Against the live public URL, after the deployment:

- All 18 migrations applied (12 before, 6 new). The policy baseline seeded 8
  rules: 5 SEVERE, 3 REVIEW.
- `/api/v1/health/ready` returns `ok` for database, Redis and storage, on
  three consecutive polls.
- Full login end to end: OTP request, code read back, verify 200, session
  cookies set with `Secure`, and an authenticated `/api/v1/me` returning 200.
- In a real browser: the login screen fills the code in by itself, lands on
  `/`, the space composer loads, `/system-status` reports everything healthy,
  and the console has no errors.
- The space-creation gate works against the seeded baseline: a title matching
  the `gambling` rule is refused with 422 `SPACE_BLOCKED` and creates no
  space; an ordinary one reaches precheck `ALLOW` citing
  `baseline:v1:8rules`.
- `/api/v1/ai/suggest` returns outcome `FALLBACK` with a usable rule-based
  answer, which is the designed no-provider behaviour.
- Site Manager's four containers and the parent domain are unchanged, and
  `nginx -t` passes.
- Verification accounts and spaces were deleted afterwards; the database
  holds 0 users and 0 spaces.

### Three defects this deployment found

All three were invisible to the test suite and only appeared on a real host.

1. **An empty environment variable crashed the API.** Compose writes
   `${VAR:-}` as an empty string and `.optional()` rejects that rather than
   treating it as unset, so the API refused to boot over `GEMINI_API_KEY`
   that nobody had set. `AI_DAILY_BUDGET_MICROS` had the dangerous version:
   `z.coerce.number()` reads `''` as `0`, a real ceiling of nothing.
2. **Storage reported down because of a flaky DNS lookup.** The API signs
   storage URLs on the public hostname, so its own internal calls resolved
   that name through the host's upstream resolvers — which answer for this
   zone only intermittently (two of three lookups succeeded). The name is now
   pinned via `extra_hosts` to `PUBLIC_HOST_IP`.
3. **The default Gemini model was retired**, so the provider would have
   404ed the moment a key was configured and every capability would have
   silently fallen back.
