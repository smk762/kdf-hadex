#!/usr/bin/env bash
set -euo pipefail

# rebuild-local.sh - Build the kdf-hadex Docker image locally with fallbacks.
# Usage: ./rebuild-local.sh [--no-cache]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NO_CACHE=""
if [ "${1-}" = "--no-cache" ]; then
  NO_CACHE=1
fi

echo "Working dir: $SCRIPT_DIR"

IMAGE_NAME="kdf-hadex:local"
CONTAINER_NAME="kdf-hadex-local"

# Helpers
docker_rm() {
  docker rm -f "$1" >/dev/null 2>&1 || true
}

docker_rmi() {
  docker rmi "$1" >/dev/null 2>&1 || true
}

# Clean previous
echo "Removing any existing test container/image..."
docker_rm "$CONTAINER_NAME"
docker_rmi "$IMAGE_NAME"

echo "Pruning dangling images..."
docker image prune -f || true

# Build using explicit -f path to avoid relative symlink issues
DOCKERFILE_PATH="$SCRIPT_DIR/Dockerfile"
BUILD_CTX="$SCRIPT_DIR"
BUILD_ARGS=("docker" "build" "-t" "$IMAGE_NAME" "-f" "$DOCKERFILE_PATH" "$BUILD_CTX")
if [ -n "$NO_CACHE" ]; then
  BUILD_ARGS=("docker" "build" "--no-cache" "-t" "$IMAGE_NAME" "-f" "$DOCKERFILE_PATH" "$BUILD_CTX")
fi

echo "Running: ${BUILD_ARGS[*]}"
if "${BUILD_ARGS[@]}"; then
  echo "Build succeeded: $IMAGE_NAME"
  exit 0
fi

# If build failed due to filesystem/symlink issues, fallback to copying to a local temp dir
echo "Initial build failed; attempting fallback by copying repo to a local temp dir..."
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
rsync -a --exclude '.git' "$SCRIPT_DIR/" "$TMPDIR/"

FALLBACK_DOCKERFILE="$TMPDIR/Dockerfile"
FALLBACK_BUILD_ARGS=("docker" "build" "-t" "$IMAGE_NAME" "-f" "$FALLBACK_DOCKERFILE" "$TMPDIR")
if [ -n "$NO_CACHE" ]; then
  FALLBACK_BUILD_ARGS=("docker" "build" "--no-cache" "-t" "$IMAGE_NAME" "-f" "$FALLBACK_DOCKERFILE" "$TMPDIR")
fi

echo "Running fallback: ${FALLBACK_BUILD_ARGS[*]}"
if "${FALLBACK_BUILD_ARGS[@]}"; then
  echo "Fallback build succeeded: $IMAGE_NAME"
  exit 0
else
  echo "Fallback build failed. Check Docker daemon logs and file permissions." >&2
  exit 1
fi
