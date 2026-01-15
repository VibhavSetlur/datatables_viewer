#!/bin/bash
# Config Versioning Script
# Manages config versions with folder structure
#
# Usage:
#   ./scripts/version-config.sh <config-file.json> [version] [message]
#
# Creates folder structure:
#   public/config/versions/{config-type}/
#     v1.0.0/
#       config.json
#       metadata.json
#     v1.1.0/
#       config.json
#       metadata.json

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_DIR="$ROOT_DIR/public/config"
VERSIONS_DIR="$CONFIG_DIR/versions"

# Check arguments
if [ $# -lt 1 ]; then
    echo "Usage: $0 <config-file.json> [version] [message]" >&2
    echo "" >&2
    echo "Examples:" >&2
    echo "  $0 my-config.json" >&2
    echo "  $0 my-config.json 1.0.0" >&2
    echo "  $0 my-config.json 1.0.0 'Initial version'" >&2
    exit 1
fi

CONFIG_FILE="$1"
VERSION="${2:-}"
MESSAGE="${3:-}"

# Validate config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: Config file not found: $CONFIG_FILE" >&2
    exit 1
fi

# Validate the config first
echo "Validating config..."
if ! "$SCRIPT_DIR/validate-config.sh" "$CONFIG_FILE"; then
    echo "Error: Config validation failed" >&2
    exit 1
fi

# Read config to get type and version
CONFIG_JSON=$(cat "$CONFIG_FILE")
CONFIG_TYPE=$(echo "$CONFIG_JSON" | jq -r '.id // empty')
CONFIG_VERSION=$(echo "$CONFIG_JSON" | jq -r '.version // "1.0.0"')

# Use provided version or config version
if [ -z "$VERSION" ]; then
    VERSION="$CONFIG_VERSION"
fi

# Generate config type from filename if not in config
if [ -z "$CONFIG_TYPE" ]; then
    CONFIG_TYPE=$(basename "$CONFIG_FILE" .json)
fi

# Create versions directory structure
TYPE_DIR="$VERSIONS_DIR/$CONFIG_TYPE"
VERSION_DIR="$TYPE_DIR/v$VERSION"

mkdir -p "$VERSION_DIR"

# Copy config to version directory
cp "$CONFIG_FILE" "$VERSION_DIR/config.json"

# Create metadata
METADATA=$(cat <<EOF
{
  "config_type": "$CONFIG_TYPE",
  "version": "$VERSION",
  "created_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "created_by": "$(whoami)",
  "message": "$MESSAGE",
  "source_file": "$(basename "$CONFIG_FILE")"
}
EOF
)

echo "$METADATA" | jq . > "$VERSION_DIR/metadata.json"

# Create or update latest symlink
LATEST_LINK="$TYPE_DIR/latest"
if [ -L "$LATEST_LINK" ]; then
    rm "$LATEST_LINK"
fi
ln -s "v$VERSION" "$LATEST_LINK"

# Create or update index
INDEX_FILE="$TYPE_DIR/index.json"
if [ -f "$INDEX_FILE" ]; then
    # Add to existing index
    INDEX_JSON=$(cat "$INDEX_FILE")
    INDEX_JSON=$(echo "$INDEX_JSON" | jq ".versions += [\"v$VERSION\"]")
    echo "$INDEX_JSON" | jq . > "$INDEX_FILE"
else
    # Create new index
    cat > "$INDEX_FILE" <<EOF
{
  "config_type": "$CONFIG_TYPE",
  "versions": ["v$VERSION"],
  "latest": "v$VERSION",
  "created_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
fi

# Update latest in index
INDEX_JSON=$(cat "$INDEX_FILE")
INDEX_JSON=$(echo "$INDEX_JSON" | jq ".latest = \"v$VERSION\"")
echo "$INDEX_JSON" | jq . > "$INDEX_FILE"

echo "✓ Config versioned successfully"
echo "  Type: $CONFIG_TYPE"
echo "  Version: $VERSION"
echo "  Location: $VERSION_DIR"
echo "  Latest: $LATEST_LINK"
