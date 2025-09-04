#!/bin/bash
# Installation script for KDF Orderbook Lovelace Cards
# This script copies the card files to the Home Assistant www directory

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}KDF Orderbook Lovelace Cards Installation${NC}"
echo "=============================================="

# Check if we're in the right directory
if [[ ! -f "rootfs/www/kdf-orderbook-card.js" ]]; then
    echo -e "${RED}Error: Card files not found. Please run this script from the kdf-hadex directory.${NC}"
    exit 1
fi

# Detect Home Assistant configuration directory
HA_CONFIG_DIR=""
if [[ -d "/config" ]]; then
    HA_CONFIG_DIR="/config"
elif [[ -d "$HOME/.homeassistant" ]]; then
    HA_CONFIG_DIR="$HOME/.homeassistant"
elif [[ -d "$HOME/config" ]]; then
    HA_CONFIG_DIR="$HOME/config"
else
    echo -e "${YELLOW}Warning: Could not auto-detect Home Assistant config directory.${NC}"
    read -p "Please enter the path to your Home Assistant config directory: " HA_CONFIG_DIR
fi

if [[ ! -d "$HA_CONFIG_DIR" ]]; then
    echo -e "${RED}Error: Directory $HA_CONFIG_DIR does not exist.${NC}"
    exit 1
fi

WWW_DIR="$HA_CONFIG_DIR/www"

# Create www directory if it doesn't exist
if [[ ! -d "$WWW_DIR" ]]; then
    echo -e "${YELLOW}Creating www directory: $WWW_DIR${NC}"
    mkdir -p "$WWW_DIR"
fi

# Copy card files
echo -e "${BLUE}Copying card files to $WWW_DIR...${NC}"

cp rootfs/www/kdf-orderbook-card.js "$WWW_DIR/"
cp rootfs/www/kdf-orderbook-card-editor.js "$WWW_DIR/"
cp rootfs/www/manifest.json "$WWW_DIR/"

echo -e "${GREEN}✓ Card files copied successfully!${NC}"

# Check if files were copied
if [[ -f "$WWW_DIR/kdf-orderbook-card.js" ]]; then
    echo -e "${GREEN}✓ kdf-orderbook-card.js${NC}"
else
    echo -e "${RED}✗ kdf-orderbook-card.js${NC}"
fi

if [[ -f "$WWW_DIR/kdf-orderbook-card-editor.js" ]]; then
    echo -e "${GREEN}✓ kdf-orderbook-card-editor.js${NC}"
else
    echo -e "${RED}✗ kdf-orderbook-card-editor.js${NC}"
fi

if [[ -f "$WWW_DIR/manifest.json" ]]; then
    echo -e "${GREEN}✓ manifest.json${NC}"
else
    echo -e "${RED}✗ manifest.json${NC}"
fi

echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Go to Home Assistant → Configuration → Lovelace Dashboards → Resources"
echo "2. Click '+ Add Resource'"
echo "3. Set URL to: /local/kdf-orderbook-card.js"
echo "4. Set Resource type to: JavaScript Module"
echo "5. Click 'Save' and restart Home Assistant"
echo ""
echo -e "${BLUE}Or add this to your configuration.yaml:${NC}"
echo "lovelace:"
echo "  resources:"
echo "    - url: /local/kdf-orderbook-card.js"
echo "      type: module"
echo ""
echo -e "${GREEN}Installation complete!${NC}"
