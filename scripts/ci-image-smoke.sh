#!/usr/bin/env bash
set -euo pipefail
: "${TEST_IMAGE:?TEST_IMAGE is required}"
: "${EXPECTED_ARCH:?EXPECTED_ARCH is required}"
container="sakura-smoke-${GITHUB_RUN_ID:-local}-${EXPECTED_ARCH}"
volume="${container}-data"
cleanup() {
  docker logs "$container" 2>/dev/null || true
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker pull "$TEST_IMAGE"
actual=$(docker image inspect "$TEST_IMAGE" --format '{{.Architecture}}')
test "$actual" = "$EXPECTED_ARCH"
docker volume create "$volume" >/dev/null
start() {
  docker run -d --name "$container" -p 127.0.0.1:3101:3000 -v "$volume:/app/data" "$TEST_IMAGE"
  for attempt in $(seq 1 40); do
    if curl --fail --silent http://127.0.0.1:3101/api/health >/dev/null; then return; fi
    sleep 2
  done
  return 1
}
start
project=$(curl --fail --silent --show-error -H 'Content-Type: application/json' -d '{"name":"Native image persistence smoke"}' http://127.0.0.1:3101/api/projects)
project_id=$(jq -er '.id' <<< "$project")
curl --fail --silent --show-error "http://127.0.0.1:3101/api/export/$project_id?format=png" -o /tmp/sakura-smoke.png
test -s /tmp/sakura-smoke.png
# Recreate the container while retaining its data volume.
docker rm -f "$container" >/dev/null
start
curl --fail --silent --show-error "http://127.0.0.1:3101/api/projects/$project_id" | jq -e '.name == "Native image persistence smoke" and .version == 1'
# docker exec defaults to the image user, independently of the entrypoint's gosu.
docker exec "$container" node -e 'const status = require("node:fs").readFileSync("/proc/1/status", "utf8"); const uid = status.match(/^Uid:\s+(\d+)/m)?.[1]; if (!uid || uid === "0") throw new Error("Application PID 1 must run as non-root"); console.log("Application UID:", uid);'
