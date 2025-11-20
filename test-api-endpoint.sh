#!/bin/bash
# Test the deployed queue endpoint on Render

# Configuration
API_URL="https://onlyworks-backend-server.onrender.com/api/work-sessions"
SESSION_ID="00479e20-d6ca-4eff-acc6-efb1a689682e"  # 24 screenshots
JWT_TOKEN="YOUR_JWT_TOKEN_HERE"  # Replace with your actual JWT token

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 Testing OnlyWorks Queue Endpoint${NC}"
echo ""
echo "Endpoint: ${API_URL}/${SESSION_ID}/queue"
echo "Session: ${SESSION_ID}"
echo ""

# Check if JWT token is set
if [ "$JWT_TOKEN" == "YOUR_JWT_TOKEN_HERE" ]; then
    echo -e "${RED}❌ Error: Please set your JWT_TOKEN in this script${NC}"
    echo ""
    echo "Edit this file and replace YOUR_JWT_TOKEN_HERE with your actual token"
    exit 1
fi

# Make the API call
echo -e "${YELLOW}📤 Queuing session for GPU processing...${NC}"
echo ""

response=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/${SESSION_ID}/queue" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json")

# Extract HTTP status code and body
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "Response:"
echo "$body" | jq . 2>/dev/null || echo "$body"
echo ""

# Check status code
if [ "$http_code" -eq 200 ]; then
    echo -e "${GREEN}✅ Success! Session queued (HTTP $http_code)${NC}"
    echo ""
    echo "GPU worker should now process this session."
    echo "Check your GPU worker logs to verify task was received."
else
    echo -e "${RED}❌ Failed (HTTP $http_code)${NC}"
    echo ""
    echo "Possible issues:"
    echo "  - Invalid JWT token"
    echo "  - Session doesn't exist or doesn't belong to this user"
    echo "  - Redis connection issue"
fi
