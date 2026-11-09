#!/bin/sh
set -eu
export NGINX_PORT="${NGINX_PORT:-8080}"
export API_UPSTREAM="${API_UPSTREAM:-http://127.0.0.1:8787}"
envsubst '${NGINX_PORT} ${API_UPSTREAM}' \
  < /etc/nginx/templates-muse/default.conf.template \
  > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
