#!/bin/bash

# ═════════════════════════════════════════════════════════════════════════════
# KAVOX MICROSERVICES STARTUP SCRIPT
# ═════════════════════════════════════════════════════════════════════════════

set -e

echo "
╔════════════════════════════════════════════════════════════════════════════╗
║                   KAVOX - Microservices Startup                           ║
║          Full-Stack eCommerce Platform with Qikink POD Integration        ║
╚════════════════════════════════════════════════════════════════════════════╝
"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVICES=(
  "gateway:3000"
  "auth:3001"
  "product:3002"
  "order:3003"
  "payment:3004"
  "qikink:3005"
  "search:3006"
  "recommendation:3007"
  "seller:3008"
  "admin:3009"
)

# Check if .env file exists
if [ ! -f ".env" ]; then
  echo -e "${RED}❌ Error: .env file not found${NC}"
  echo -e "${YELLOW}Please copy .env.example to .env and fill in your values:${NC}"
  echo "  cp .env.example .env"
  exit 1
fi

echo -e "${BLUE}📋 Environment Configuration:${NC}"
echo "  NODE_ENV: $(grep '^NODE_ENV=' .env | cut -d= -f2)"
echo "  MongoDB: $(grep '^MONGODB_URI=' .env | cut -d= -f2)"
echo ""

# Check if MongoDB is running
echo -e "${BLUE}🔍 Checking MongoDB connection...${NC}"
if ! command -v mongod &> /dev/null; then
  echo -e "${YELLOW}⚠️  mongod not found. Make sure MongoDB is running on $(grep '^MONGODB_URI=' .env | cut -d= -f2)${NC}"
fi

echo ""
echo -e "${BLUE}📦 Installing dependencies...${NC}"
npm install --silent 2>&1 | grep -v "^npm WARN" || true

echo ""
echo -e "${GREEN}✅ Starting microservices...${NC}"
echo -e "${YELLOW}Services will start on the following ports:${NC}"
for service in "${SERVICES[@]}"; do
  name="${service%:*}"
  port="${service#*:}"
  echo -e "  ${BLUE}→${NC} $name on port ${GREEN}$port${NC}"
done

echo ""
echo -e "${YELLOW}Starting in 3 seconds...${NC}"
sleep 3

# Show log files location
LOGS_DIR="./logs"
mkdir -p "$LOGS_DIR"

echo ""
echo -e "${GREEN}🚀 Launching all services...${NC}"
echo -e "${YELLOW}Logs available in: $LOGS_DIR${NC}"
echo ""

# Start services based on argument
if [ "$1" == "dev" ]; then
  echo -e "${BLUE}Development mode (with hot reload)${NC}"
  npm run dev:all
elif [ "$1" == "single" ]; then
  if [ -z "$2" ]; then
    echo "Usage: ./startup.sh single <service-name>"
    echo "Available services: gateway, auth, product, order, payment, qikink, search, recommendation, seller, admin"
    exit 1
  fi
  echo -e "${BLUE}Starting single service: $2${NC}"
  npm run "start:$2"
else
  # Production mode - start all services
  echo -e "${BLUE}Production mode${NC}"
  npm run start:all
fi

# Cleanup on exit
trap "echo -e '\n${RED}Shutting down services...${NC}'; kill 0" EXIT
wait
