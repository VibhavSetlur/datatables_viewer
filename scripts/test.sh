#!/bin/bash

# DataTables Viewer - Deployment Readiness Check
# This script runs all necessary checks to ensure the app is ready for deployment.

# Exit on any failure
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}==================================================${NC}"
echo -e "${BLUE}   DataTables Viewer: Pre-deployment Checks      ${NC}"
echo -e "${BLUE}==================================================${NC}"

# 1. Dependency Check
echo -e "\n${BLUE}[1/4] Checking dependencies...${NC}"
if [ ! -d "node_modules" ]; then
    echo -e "${RED}node_modules not found. Running npm install...${NC}"
    npm install
else
    echo -e "${GREEN}✓ Dependencies present${NC}"
fi

# 2. Type Checking
echo -e "\n${BLUE}[2/4] Running Type Check (tsc)...${NC}"
npm run typecheck
echo -e "${GREEN}✓ Type check passed${NC}"

# 3. Unit Tests
echo -e "\n${BLUE}[3/4] Running Unit Tests (Vitest)...${NC}"
# Use --run to prevent Vitest from entering watch mode
npm test -- --run
echo -e "${GREEN}✓ All tests passed${NC}"

# 4. Production Build
echo -e "\n${BLUE}[4/4] Verifying Production Build...${NC}"
npm run build
echo -e "${GREEN}✓ Build successful${NC}"

echo -e "\n${GREEN}==================================================${NC}"
echo -e "${GREEN}   ✨ SUCCESS: READY FOR DEPLOYMENT ✨            ${NC}"
echo -e "${GREEN}==================================================${NC}"
