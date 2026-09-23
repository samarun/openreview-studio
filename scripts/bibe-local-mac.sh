#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.bibe-local.yml"
DEV_COMPOSE_FILE="$ROOT_DIR/docker-compose.bibe-dev.yml"
ENV_FILE="$ROOT_DIR/.env.bibe-local"
DEV_ENV_FILE="$ROOT_DIR/.env.bibe-dev"
PROJECT_NAME="openreview-bibe-local"
DEV_PROJECT_NAME="openreview-bibe-dev"
DEFAULT_APP_PORT="8088"
DEFAULT_DEV_PORT="8087"
REGISTRY_PORT="5005"

compose() {
  docker compose \
    --project-name "$PROJECT_NAME" \
    --env-file "$ENV_FILE" \
    -f "$COMPOSE_FILE" \
    "$@"
}

dev_compose() {
  docker compose \
    --project-name "$DEV_PROJECT_NAME" \
    --env-file "$DEV_ENV_FILE" \
    -f "$COMPOSE_FILE" \
    -f "$DEV_COMPOSE_FILE" \
    "$@"
}

require_mac_runtime() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "This launcher is intentionally limited to the local Mac." >&2
    exit 1
  fi

  command -v orb >/dev/null || {
    echo "OrbStack is required. Install it before running this launcher." >&2
    exit 1
  }

  if ! orb status 2>/dev/null | grep -q '^Running$'; then
    echo "Starting OrbStack..."
    orb start
  fi

  docker info >/dev/null
  docker compose version >/dev/null
  command -v openssl >/dev/null
  command -v curl >/dev/null
}

port_is_available() {
  local port="$1"
  ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

create_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    chmod 600 "$ENV_FILE"
    return
  fi

  if ! port_is_available "$DEFAULT_APP_PORT"; then
    echo "Port $DEFAULT_APP_PORT is already occupied; set a different BIBE_LOCAL_PORT in $ENV_FILE." >&2
    exit 1
  fi

  if ! port_is_available "$REGISTRY_PORT"; then
    echo "Port $REGISTRY_PORT is already occupied by a non-lab process." >&2
    exit 1
  fi

  local revision
  revision="$(git -C "$ROOT_DIR" rev-parse HEAD)"

  umask 077
  {
    printf 'BIBE_LOCAL_PORT=%s\n' "$DEFAULT_APP_PORT"
    printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)"
    printf 'MINIO_ROOT_USER=openreview-local\n'
    printf 'MINIO_ROOT_PASSWORD=%s\n' "$(openssl rand -hex 24)"
    printf 'JWT_SECRET=%s\n' "$(openssl rand -hex 32)"
    printf 'BIBE_WEB_IMAGE=localhost:%s/openreview-web:sha-%s\n' "$REGISTRY_PORT" "$revision"
    printf 'BIBE_API_IMAGE=localhost:%s/openreview-api:sha-%s\n' "$REGISTRY_PORT" "$revision"
    printf 'BIBE_WORKER_IMAGE=localhost:%s/openreview-worker:sha-%s\n' "$REGISTRY_PORT" "$revision"
  } >"$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE with local-only generated secrets."
}

create_dev_env_file() {
  if [[ -f "$DEV_ENV_FILE" ]]; then
    chmod 600 "$DEV_ENV_FILE"
    return
  fi

  if ! port_is_available "$DEFAULT_DEV_PORT"; then
    echo "Port $DEFAULT_DEV_PORT is occupied; set a free BIBE_LOCAL_PORT in $DEV_ENV_FILE." >&2
    exit 1
  fi

  umask 077
  {
    printf 'BIBE_LOCAL_PORT=%s\n' "$DEFAULT_DEV_PORT"
    printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)"
    printf 'MINIO_ROOT_USER=openreview-dev\n'
    printf 'MINIO_ROOT_PASSWORD=%s\n' "$(openssl rand -hex 24)"
    printf 'JWT_SECRET=%s\n' "$(openssl rand -hex 32)"
  } >"$DEV_ENV_FILE"
  chmod 600 "$DEV_ENV_FILE"
  echo "Created $DEV_ENV_FILE with isolated development credentials."
}

load_env() {
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a

  # The retained secrets file may predate the current checkout. Shell values
  # override Compose's --env-file so exact-image tags always match HEAD.
  local revision
  revision="$(git -C "$ROOT_DIR" rev-parse HEAD)"
  export BIBE_WEB_IMAGE="localhost:${REGISTRY_PORT}/openreview-web:sha-${revision}"
  export BIBE_API_IMAGE="localhost:${REGISTRY_PORT}/openreview-api:sha-${revision}"
  export BIBE_WORKER_IMAGE="localhost:${REGISTRY_PORT}/openreview-worker:sha-${revision}"
}

build_and_publish() {
  if [[ -n "$(git -C "$ROOT_DIR" status --porcelain -- apps packages Dockerfile.web Dockerfile.api Dockerfile.worker pnpm-lock.yaml pnpm-workspace.yaml)" ]]; then
    echo "Application/build inputs have uncommitted changes; refusing to publish them under a commit SHA." >&2
    exit 1
  fi

  echo "Starting the loopback-only Mac registry..."
  compose --profile registry up -d registry
  curl --fail --silent --show-error --retry 20 --retry-delay 1 \
    "http://127.0.0.1:${REGISTRY_PORT}/v2/" >/dev/null

  echo "Building web, API, and worker images for this Mac..."
  compose build web api worker

  echo "Publishing exact-revision image tags to the loopback registry..."
  docker push "$BIBE_WEB_IMAGE"
  docker push "$BIBE_API_IMAGE"
  docker push "$BIBE_WORKER_IMAGE"
}

start_stack() {
  echo "Refreshing backing-service images for the Mac architecture..."
  docker pull postgres:16-alpine
  docker pull redis:7-alpine
  docker pull quay.io/minio/minio:RELEASE.2024-12-18T13-15-44Z
  docker pull quay.io/minio/mc:RELEASE.2024-11-21T17-21-54Z
  docker pull nginx:1.27-alpine

  echo "Pulling the exact tags back from the loopback registry..."
  docker pull "$BIBE_WEB_IMAGE"
  docker pull "$BIBE_API_IMAGE"
  docker pull "$BIBE_WORKER_IMAGE"

  echo "Starting the isolated local stack..."
  compose up -d --no-build --wait --wait-timeout 300
  # Nginx resolves Compose service names at startup. After a new commit changes
  # container IPs, refresh only this project's gateway before health checks.
  compose up -d --no-build --no-deps --force-recreate gateway
}

verify_stack() {
  local base_url="http://127.0.0.1:${BIBE_LOCAL_PORT}"
  local login_response

  curl --fail --silent --show-error --retry 20 --retry-all-errors --retry-delay 2 \
    "$base_url/api/health/ready" >/dev/null
  curl --fail --silent --show-error --retry 20 --retry-all-errors --retry-delay 2 \
    "$base_url/login" >/dev/null

  login_response="$(curl --fail --silent --show-error \
    -H 'Content-Type: application/json' \
    -d '{"email":"demo@openreview.local","password":"openreview-demo"}' \
    "$base_url/api/auth/login")"

  if [[ "$login_response" != *'"token"'* ]]; then
    echo "Demo login did not return a token." >&2
    exit 1
  fi

  curl --fail --silent --show-error \
    "http://127.0.0.1:${REGISTRY_PORT}/v2/" >/dev/null

  echo
  compose ps
  echo
  echo "Mac local-development verification passed."
  echo "OpenReview: $base_url/"
  echo "Demo login: demo@openreview.local / openreview-demo"
  echo "Registry: http://127.0.0.1:${REGISTRY_PORT}/v2/"
}

verify_dev_stack() {
  local app_port
  app_port="$(sed -n 's/^BIBE_LOCAL_PORT=//p' "$DEV_ENV_FILE" | head -1)"
  local base_url="http://127.0.0.1:$app_port"
  local login_response

  curl --fail --silent --show-error --retry 20 --retry-all-errors --retry-delay 2 \
    "$base_url/api/health/ready" >/dev/null
  curl --fail --silent --show-error --retry 20 --retry-all-errors --retry-delay 2 \
    "$base_url/login" >/dev/null
  login_response="$(curl --fail --silent --show-error \
    -H 'Content-Type: application/json' \
    -d '{"email":"demo@openreview.local","password":"openreview-demo"}' \
    "$base_url/api/auth/login")"
  if [[ "$login_response" != *'"token"'* ]]; then
    echo "Development demo login did not return a token." >&2
    exit 1
  fi
  echo "Mac hot-reload development verification passed: $base_url/"
}

show_status() {
  create_env_file
  load_env
  compose ps
  echo "OpenReview: http://127.0.0.1:${BIBE_LOCAL_PORT}/"
}

stop_stack() {
  create_env_file
  load_env
  compose --profile registry down
  echo "Stopped the Mac stack. Named volumes were retained."
}

usage() {
  cat <<'EOF'
Usage: scripts/bibe-local-mac.sh <command>

Commands:
  setup    Generate local secrets, build exact-revision images, and start/verify
  start    Start the retained stack without rebuilding images
  verify   Check API readiness, the login page, demo login, and local registry
  status   Show Compose status and the local URL
  stop     Stop only this Compose project; retain all named volumes
  media-canary   Upload and process a short video in the exact-image stack
  dev-start      Build and start an isolated source-watch stack on port 8087
  dev-watch      Watch source changes and sync/rebuild development containers
  dev-verify     Check the development API and login
  dev-media-canary  Upload and process a short video in the development stack
  dev-status     Show development container status
  dev-stop       Stop development containers; retain their named volumes
EOF
}

main() {
  local command="${1:-}"
  require_mac_runtime

  case "$command" in
    setup)
      create_env_file
      load_env
      build_and_publish
      start_stack
      verify_stack
      ;;
    start)
      create_env_file
      load_env
      compose --profile registry up -d registry
      start_stack
      verify_stack
      ;;
    verify)
      create_env_file
      load_env
      verify_stack
      ;;
    status)
      show_status
      ;;
    stop)
      stop_stack
      ;;
    media-canary)
      create_env_file
      load_env
      BIBE_CANARY_URL="http://127.0.0.1:${BIBE_LOCAL_PORT}" "$ROOT_DIR/scripts/bibe-media-canary.sh"
      ;;
    dev-start)
      create_dev_env_file
      dev_compose up -d --build --wait --wait-timeout 300
      dev_compose up -d --no-build --no-deps --force-recreate gateway
      verify_dev_stack
      ;;
    dev-watch)
      create_dev_env_file
      dev_compose watch --no-up
      ;;
    dev-verify)
      create_dev_env_file
      verify_dev_stack
      ;;
    dev-media-canary)
      create_dev_env_file
      dev_port="$(sed -n 's/^BIBE_LOCAL_PORT=//p' "$DEV_ENV_FILE" | head -1)"
      BIBE_CANARY_URL="http://127.0.0.1:${dev_port}" "$ROOT_DIR/scripts/bibe-media-canary.sh"
      ;;
    dev-status)
      create_dev_env_file
      dev_compose ps
      ;;
    dev-stop)
      create_dev_env_file
      dev_compose down
      echo "Stopped the Mac development stack. Named volumes were retained."
      ;;
    *)
      usage
      exit 2
      ;;
  esac
}

main "$@"
