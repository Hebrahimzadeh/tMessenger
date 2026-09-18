# Gemini relay on Cloudflare Workers

## Why this exists

Google answers the production host with `400 FAILED_PRECONDITION - User
location is not supported for the API use`. Measured on 2026-09-18, the cause
is not what it looks like:

- **Not the API key.** Two different keys, including one in the standard
  `AIzaSy…` format, get the identical error. The request never reaches the
  point where a key would be checked.
- **Not the DNS unblocker.** It is working: `generativelanguage.googleapis.com`
  resolves to its German relay and the TLS certificate that comes back is
  genuinely Google's, so the request does arrive at Google.
- **It is the address Google sees.** An echo service the unblocker does not
  proxy still reports the real Iranian address, and Google refuses the
  unblocker's own relay addresses for this API.

A Cloudflare Worker runs in the colo nearest the caller and calls Google from
Cloudflare's network. `https://www.cloudflare.com/cdn-cgi/trace` from the
production host reports `colo=FRA`, so the Worker runs in Frankfurt and Google
sees a German Cloudflare address.

## What it does

```text
API container
  -> https://<worker>.workers.dev/v1beta/models/<model>:generateContent?key=<RELAY_TOKEN>
  -> Worker: checks RELAY_TOKEN, swaps in the real GEMINI_API_KEY
  -> https://generativelanguage.googleapis.com/... (from Cloudflare, Frankfurt)
```

Three properties worth keeping:

- **Not an open relay.** The `key` parameter must equal `RELAY_TOKEN`, compared
  in constant time, and a wrong one is refused before any upstream call. A
  relay that forwards whatever it is given would let anyone who found the URL
  spend the account's quota.
- **The Google key never leaves Cloudflare.** The server holds only the relay
  token. This is strictly better than the arrangement it replaces, where the
  server held the Google key itself.
- **Nothing is logged.** Prompts pass through here; `observability` is off in
  `wrangler.toml` so request logs do not become a copy of user text on a third
  party's infrastructure.

## Deploy

From this directory, with Node installed:

```sh
npx wrangler login                      # opens a browser once
npx wrangler secret put GEMINI_API_KEY  # paste the real AIzaSy… key
npx wrangler secret put RELAY_TOKEN     # paste a long random string, e.g.
                                        #   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npx wrangler deploy
```

`wrangler deploy` prints the URL, of the form
`https://tmessenger-gemini-relay.<your-subdomain>.workers.dev`.

Without a browser, create an API token instead (My Profile → API Tokens →
*Edit Cloudflare Workers*) and export `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` before the same commands.

## Point the application at it

On the server, in `/opt/tmessenger/shared/.env`:

```dotenv
GEMINI_BASE_URL=https://tmessenger-gemini-relay.<your-subdomain>.workers.dev/v1beta/models
GEMINI_API_KEY=<the RELAY_TOKEN, not the Google key>
```

Then, from the current release directory:

```sh
DC='docker compose --env-file /opt/tmessenger/shared/.env -f deploy/compose.production.yml'
$DC up -d api
```

No rebuild: both are runtime settings.

## Check it works

From the server, the relay itself:

```sh
curl -sS -X POST "$GEMINI_BASE_URL/gemini-3.6-flash:generateContent?key=$RELAY_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"contents":[{"parts":[{"text":"Reply with exactly: ok"}]}]}'
```

Then the application, which is the answer that actually matters - build a
space and look at `creativityApplied`:

```sh
curl -sS -b cookies.txt -X POST https://tmessenger.taavonafarin.ir/api/v1/spaces/build \
  -H 'content-type: application/json' -d '{"prompt":"..."}'
```

`creativityApplied: true` means the model wrote it. `false` means the rules
did, which stays a supported way to run: nothing breaks without the relay, the
spaces are simply less creatively written and the interface says so.

## If Google refuses the Worker too

Cloudflare's egress is ordinary datacentre address space and Google may
classify some of it the same way. The Worker returns Google's own status and
body untouched, so the same `FAILED_PRECONDITION` would be visible in the
`curl` above. In that case the remaining option is a small relay of your own on
a VPS in a country Google accepts, pointed at by the same `GEMINI_BASE_URL` -
nothing in the application changes.
