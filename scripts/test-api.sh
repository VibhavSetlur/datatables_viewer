#!/bin/bash
# Test script to diagnose TableScanner API authentication issues

set -e

echo "=========================================="
echo "TableScanner API Diagnostic Test"
echo "=========================================="
echo ""

# Check if token is provided
if [ -z "$KB_TOKEN" ]; then
    echo "ERROR: KB_TOKEN environment variable not set"
    echo "Usage: KB_TOKEN=your_token_here ./scripts/test-api.sh"
    exit 1
fi

OBJECT_ID="${1:-76990/7/2}"
ENV="${2:-appdev}"

if [ "$ENV" = "appdev" ]; then
    BASE_URL="https://appdev.kbase.us/services/berdl_table_scanner"
elif [ "$ENV" = "prod" ]; then
    BASE_URL="https://kbase.us/services/berdl_table_scanner"
else
    BASE_URL="http://127.0.0.1:8000"
fi

echo "Testing with:"
echo "  Object ID: $OBJECT_ID"
echo "  Environment: $ENV"
echo "  Base URL: $BASE_URL"
echo "  Token: ${KB_TOKEN:0:20}... (truncated)"
echo ""

echo "----------------------------------------"
echo "Test 1: List Tables"
echo "----------------------------------------"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
    -H "Authorization: Bearer $KB_TOKEN" \
    -H "Content-Type: application/json" \
    "$BASE_URL/object/$OBJECT_ID/tables" 2>&1)

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')

echo "HTTP Status: $HTTP_STATUS"
echo "Response:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ SUCCESS: Tables retrieved successfully"
    exit 0
elif [ "$HTTP_STATUS" = "401" ]; then
    echo "❌ AUTHENTICATION ERROR: Token is invalid or expired"
    echo ""
    echo "Possible solutions:"
    echo "  1. Get a new token from KBase"
    echo "  2. Verify the token is for the correct environment ($ENV)"
    exit 1
elif [ "$HTTP_STATUS" = "403" ]; then
    echo "❌ PERMISSION ERROR: Token doesn't have access to this object"
    echo ""
    echo "Possible solutions:"
    echo "  1. Verify you have permission to access object $OBJECT_ID"
    echo "  2. Check if the object exists in the $ENV environment"
    exit 1
elif [ "$HTTP_STATUS" = "500" ]; then
    echo "❌ SERVER ERROR: TableScanner cannot access the database"
    echo ""
    # Check if it's a Shock API issue
    if echo "$BODY" | grep -q "shock-api"; then
        echo "This is a Shock API access issue. Possible causes:"
        echo "  1. Object exists in different environment (prod vs appdev)"
        echo "  2. Token doesn't have permission to access the Shock node"
        echo "  3. TableScanner service configuration issue"
        echo ""
        echo "Try:"
        echo "  - Use a token from the correct environment"
        echo "  - Verify object $OBJECT_ID exists in $ENV"
        echo "  - Check if object is accessible via KBase UI"
    fi
    exit 1
elif [ "$HTTP_STATUS" = "404" ]; then
    echo "❌ NOT FOUND: Object $OBJECT_ID not found"
    echo ""
    echo "Possible solutions:"
    echo "  1. Verify the object ID is correct"
    echo "  2. Check if object exists in $ENV environment"
    echo "  3. Try a different object ID"
    exit 1
else
    echo "❌ UNEXPECTED ERROR: HTTP $HTTP_STATUS"
    exit 1
fi
