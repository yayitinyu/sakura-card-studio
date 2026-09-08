#!/bin/sh
set -eu
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data
  chown -R node:node /app/data
  chmod 700 /app/data
  exec gosu node "$@"
fi
exec "$@"
