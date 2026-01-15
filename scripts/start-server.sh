#!/bin/bash
# Start the DataTables Viewer server with database directory mounting

# Default values
DATA_DIR="${DATA_DIR:-./data}"
CONFIG_DIR="${CONFIG_DIR:-./public/config}"
PORT="${PORT:-3000}"

echo "Starting DataTables Viewer Server..."
echo "Data directory: $DATA_DIR"
echo "Config directory: $CONFIG_DIR"
echo "Port: $PORT"
echo ""
echo "Usage:"
echo "  DATA_DIR=/path/to/databases PORT=3000 npm run server:start"
echo "  or"
echo "  export DATA_DIR=/path/to/databases"
echo "  npm run server:start"
echo ""

# Change to server directory
cd "$(dirname "$0")/../server" || exit 1

# Start the server
DATA_DIR="$DATA_DIR" CONFIG_DIR="$CONFIG_DIR" PORT="$PORT" npm run dev
