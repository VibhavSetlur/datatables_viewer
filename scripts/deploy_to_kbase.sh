#!/bin/bash
# scripts/deploy_to_kbase.sh
# Builds the DataTables Viewer and deploys it to the KBDatalakeApps data/html directory.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEST="/home/vibhav/Downloads/Work/ANL/Research/KBDatalakeApps/data/html"

echo "============================================"
echo "  DataTables Viewer -> KBDatalakeApps Deploy"
echo "============================================"

cd "$PROJECT_ROOT"

echo ""
echo "[1/3] Building production bundle..."
npm run build

echo ""
echo "[2/3] Cleaning destination: $DEST"
rm -rf "$DEST"/*
mkdir -p "$DEST"

echo ""
echo "[3/3] Copying dist/ contents to $DEST"
cp -r dist/* "$DEST"/

echo ""
echo "============================================"
echo "  Deployment Complete!"
echo "============================================"
echo "KBDatalakeApps now has the latest viewer code."
echo "Remember to commit/push KBDatalakeApps if needed."
