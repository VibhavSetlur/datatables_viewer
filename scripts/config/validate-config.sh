#!/bin/bash
# Config Validation Script
# Validates a config JSON file against the schema
#
# Usage:
#   ./scripts/validate-config.sh <config-file.json>
#   or
#   cat config.json | ./scripts/validate-config.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SCHEMA_FILE="$ROOT_DIR/public/config/schemas/config.schema.json"

# Check if schema exists
if [ ! -f "$SCHEMA_FILE" ]; then
    echo "Error: Schema file not found: $SCHEMA_FILE" >&2
    exit 1
fi

# Get config file path or read from stdin
if [ $# -eq 0 ]; then
    # Read from stdin
    CONFIG_JSON=$(cat)
    CONFIG_FILE="stdin"
else
    CONFIG_FILE="$1"
    if [ ! -f "$CONFIG_FILE" ]; then
        echo "Error: Config file not found: $CONFIG_FILE" >&2
        exit 1
    fi
    CONFIG_JSON=$(cat "$CONFIG_FILE")
fi

# Validate JSON syntax first
if ! echo "$CONFIG_JSON" | jq . > /dev/null 2>&1; then
    echo "Error: Invalid JSON syntax" >&2
    exit 1
fi

# Use Node.js with the TypeScript validator (simpler than reimplementing in bash)
if command -v node > /dev/null 2>&1; then
    if [ "$CONFIG_FILE" = "stdin" ]; then
        echo "$CONFIG_JSON" | node "$SCRIPT_DIR/validate-config.ts" /dev/stdin
    else
        node "$SCRIPT_DIR/validate-config.ts" "$CONFIG_FILE"
    fi
else
    echo "Error: Node.js is required for validation" >&2
    echo "Please install Node.js or use: npm run validate-config <file>" >&2
    exit 1
fi
