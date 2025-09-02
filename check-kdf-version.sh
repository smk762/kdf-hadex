#!/bin/bash
# Script to check KDF version from outside the container
# Usage: ./check-kdf-version.sh [container_name]

CONTAINER_NAME="${1:-local_kdf}"
echo "Checking KDF version in container: $CONTAINER_NAME"

# Check if container is running
if ! docker ps --format "table {{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "Container '$CONTAINER_NAME' is not running"
    exit 1
fi

# Try to get version via RPC first
echo "Attempting RPC version check..."
RPC_RESULT=$(docker exec "$CONTAINER_NAME" /usr/local/bin/kdf-version 2>/dev/null)
if [ -n "$RPC_RESULT" ]; then
    echo "KDF Version (via RPC): $RPC_RESULT"
else
    echo "RPC version check failed, trying binary version..."
    BINARY_RESULT=$(docker exec "$CONTAINER_NAME" /usr/local/bin/kdf --version 2>/dev/null | head -1)
    if [ -n "$BINARY_RESULT" ]; then
        echo "KDF Version (via binary): $BINARY_RESULT"
    else
        echo "Unable to determine KDF version"
    fi
fi

# Also check the version file if it exists
echo "Checking version file..."
VERSION_FILE=$(docker exec "$CONTAINER_NAME" cat /data/kdf_version.txt 2>/dev/null)
if [ -n "$VERSION_FILE" ]; then
    echo "KDF Version (from file): $VERSION_FILE"
fi
