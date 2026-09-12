#!/bin/sh
set -eu

release_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
env_file=/opt/tmessenger/shared/.env
cd "$release_dir"

dc() {
    docker compose --env-file "$env_file" -f "$release_dir/deploy/compose.production.yml" "$@"
}

dc config --quiet
# Validate real production settings without sending an SMS or opening a port.
dc run --rm --no-deps -T --entrypoint node api --import tsx --input-type=module -e '
import { getEnv } from "./src/config/env.ts";
import { createSmsProvider } from "./src/modules/auth/sms-provider.ts";
createSmsProvider(getEnv());
if (process.env.UI_PREVIEW_MODE === "true" || process.env.PROXY_CONFIG?.endsWith("Caddyfile.preview")) {
  throw new Error("Disable UI_PREVIEW_MODE and select Caddyfile.production before production activation.");
}
console.log("Production configuration is valid.");
' </dev/null

if [ "${1:-}" = '--check' ]; then
    exit 0
fi

dc up -d
attempt=0
until curl --fail --silent --max-time 10 http://127.0.0.1:18400/v1/health/ready >/dev/null \
    && curl --fail --silent --max-time 10 http://127.0.0.1:18300/login >/dev/null; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 30 ]; then
        printf '%s\n' 'Application health checks failed; public routing remains unchanged.' >&2
        exit 1
    fi
    sleep 2
done

nginx_target=/etc/nginx/sites/tmessenger.https.nginx.conf
backup=$(mktemp /opt/tmessenger/shared/https-before-activation.XXXXXX)
cp -p "$nginx_target" "$backup"
activated=false
restore_on_failure() {
    if [ "$activated" != true ]; then
        cp -p "$backup" "$nginx_target"
        nginx -t && systemctl reload nginx
    fi
}
trap restore_on_failure EXIT HUP INT TERM

install -m 0644 "$release_dir/deploy/tmessenger.https.nginx.conf" "$nginx_target"
nginx -t
systemctl reload nginx
curl --fail --silent --show-error --max-time 15 https://tmessenger.taavonafarin.ir/api/v1/health/ready
curl --fail --silent --show-error --max-time 15 https://tmessenger.taavonafarin.ir/login >/dev/null
activated=true
trap - EXIT HUP INT TERM
printf '\nTMessenger is active at https://tmessenger.taavonafarin.ir\n'
dc ps -a
