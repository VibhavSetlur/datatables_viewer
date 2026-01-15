#!/bin/bash
# Test script for config management system

set -e

echo "Testing DataTables Viewer Config Management System"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Validate existing config
echo "Test 1: Validating existing config..."
if npm run validate-config public/config/genome-data-tables.json > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Validation passed"
else
    echo -e "${RED}✗${NC} Validation failed"
    exit 1
fi
echo ""

# Test 2: Validate test config
echo "Test 2: Validating test config..."
if npm run validate-config scripts/test-config.json > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Test config is valid"
else
    echo -e "${RED}✗${NC} Test config validation failed"
    exit 1
fi
echo ""

# Test 3: Save config (dry run - check if script exists and is executable)
echo "Test 3: Checking save-config script..."
if [ -f "scripts/save-config.ts" ]; then
    echo -e "${GREEN}✓${NC} save-config.ts exists"
else
    echo -e "${RED}✗${NC} save-config.ts not found"
    exit 1
fi
echo ""

# Test 4: Check index.json structure
echo "Test 4: Checking index.json structure..."
if [ -f "public/config/index.json" ]; then
    if node -e "JSON.parse(require('fs').readFileSync('public/config/index.json', 'utf-8'))" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} index.json is valid JSON"
    else
        echo -e "${RED}✗${NC} index.json is invalid JSON"
        exit 1
    fi
else
    echo -e "${RED}✗${NC} index.json not found"
    exit 1
fi
echo ""

# Test 5: Check schema file exists
echo "Test 5: Checking schema file..."
if [ -f "public/config/schemas/config.schema.json" ]; then
    echo -e "${GREEN}✓${NC} Schema file exists"
else
    echo -e "${RED}✗${NC} Schema file not found"
    exit 1
fi
echo ""

# Test 6: Test invalid config (should fail)
echo "Test 6: Testing invalid config rejection..."
cat > /tmp/invalid-config.json << 'EOF'
{
  "id": "invalid",
  "name": "Invalid Config"
}
EOF

if npm run validate-config /tmp/invalid-config.json > /dev/null 2>&1; then
    echo -e "${RED}✗${NC} Invalid config was accepted (should have failed)"
    rm -f /tmp/invalid-config.json
    exit 1
else
    echo -e "${GREEN}✓${NC} Invalid config correctly rejected"
fi
rm -f /tmp/invalid-config.json
echo ""

echo -e "${GREEN}All tests passed!${NC}"
echo ""
echo "System is ready to use:"
echo "  - Validate configs: npm run validate-config <file>"
echo "  - Save configs: npm run save-config <file>"
echo "  - Start API handler: npm run config-api"
