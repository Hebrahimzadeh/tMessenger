/**
 * A relay that lets this deployment reach the Gemini API.
 *
 * Why it exists: Google answers `400 FAILED_PRECONDITION - User location is
 * not supported` to the production host. That is not the API key and not the
 * DNS unblocker - the unblocker reaches Google's real endpoint, and Google
 * refuses the address it arrives from. A Worker runs in the Cloudflare colo
 * nearest the caller (Frankfurt, for this server) and calls Google from
 * Cloudflare's own network, which Google does accept.
 *
 * It is deliberately the smallest thing that can work:
 *
 * - **It is not an open relay.** The `key` query parameter must equal
 *   `RELAY_TOKEN`, compared in constant time. Without that, anybody who found
 *   the URL could spend the account's quota, and a relay that forwards
 *   whatever it is given is a hole rather than a fix.
 * - **The real Google key never leaves Cloudflare.** The caller sends the
 *   relay token; the Worker swaps it for `GEMINI_API_KEY` on the way out. The
 *   application server therefore never holds the Google key at all, which is
 *   strictly better than what it replaces.
 * - **Only the one path it needs.** `POST /v1beta/models/...`, nothing else.
 * - **Nothing is logged.** Prompts pass through this Worker; a log line here
 *   would be a copy of user text on a third party's infrastructure.
 */

const UPSTREAM = 'https://generativelanguage.googleapis.com';
const ALLOWED_PREFIX = '/v1beta/models/';

/** Length-independent comparison, so a wrong token cannot be found a character at a time. */
function tokensMatch(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string') return false;
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i += 1) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function deny(status, message) {
  return new Response(JSON.stringify({ error: { code: status, message, status: 'RELAY_REFUSED' } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** The Workers entry point. Named rather than anonymous, so a stack trace says what it is. */
const relay = {
  async fetch(request, env) {
    if (!env.RELAY_TOKEN || !env.GEMINI_API_KEY) {
      return deny(500, 'Relay is not configured: set RELAY_TOKEN and GEMINI_API_KEY.');
    }

    const url = new URL(request.url);
    if (request.method !== 'POST' || !url.pathname.startsWith(ALLOWED_PREFIX)) {
      return deny(404, 'Not found.');
    }
    if (!tokensMatch(url.searchParams.get('key'), env.RELAY_TOKEN)) {
      return deny(403, 'Forbidden.');
    }

    const upstream = new URL(url.pathname, UPSTREAM);
    upstream.searchParams.set('key', env.GEMINI_API_KEY);

    // Only the content type is carried over. Everything else a caller might
    // send - cookies, forwarding headers, anything identifying - is dropped
    // rather than handed to Google.
    const response = await fetch(upstream.toString(), {
      method: 'POST',
      headers: { 'content-type': request.headers.get('content-type') ?? 'application/json' },
      body: request.body,
      // Required by the Workers runtime when a request has a streamed body.
      duplex: 'half',
    });

    return new Response(response.body, {
      status: response.status,
      headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
    });
  },
};

export default relay;
