#!/bin/bash

# Bilzo Receipt Sync - Setup Script
# This script helps set up the Electron app for development

echo "======================================"
echo "Bilzo Receipt Sync - Setup Script"
echo "======================================"
echo ""

# Check Node.js version
echo "Checking Node.js version..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js v18 or higher."
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version is too old. Required: v18+, Found: v$NODE_VERSION"
    exit 1
fi

echo "✓ Node.js version: $(node --version)"
echo ""

# Check if .env exists
echo "Checking configuration..."
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from template..."
    cp .env.example .env
    echo "✓ Created .env file. Please edit it with your configuration."
    echo ""
    echo "Important: Edit .env and configure:"
    echo "  - SQL Server credentials"
    echo "  - API keys"
    echo "  - Store/Organization IDs"
    echo ""
    read -p "Press Enter after you've configured .env..."
else
    echo "✓ .env file exists"
fi
echo ""

# Install dependencies
echo "Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✓ Dependencies installed"
echo ""

# Check for icon files
echo "Checking icon files..."
ICONS_MISSING=0

if [ ! -f assets/icon-idle.png ]; then
    echo "⚠️  Missing: assets/icon-idle.png"
    ICONS_MISSING=1
fi

if [ ! -f assets/icon-syncing.png ]; then
    echo "⚠️  Missing: assets/icon-syncing.png"
    ICONS_MISSING=1
fi

if [ ! -f assets/icon-error.png ]; then
    echo "⚠️  Missing: assets/icon-error.png"
    ICONS_MISSING=1
fi

if [ ! -f assets/icon.ico ]; then
    echo "⚠️  Missing: assets/icon.ico"
    ICONS_MISSING=1
fi

if [ $ICONS_MISSING -eq 1 ]; then
    echo ""
    echo "Icon files are missing. Please add them before building."
    echo "See assets/ICONS_README.md for instructions."
    echo ""
    echo "TIP: Use Bilzo favicon as the base icon"
else
    echo "✓ All icon files present"
fi
echo ""

# Setup complete
echo "======================================"
echo "Setup Complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Configure .env file with your credentials"
echo "2. Add icon files to assets/ directory"
echo "3. Run in development mode:"
echo "   npm run dev"
echo ""
echo "4. Build for production:"
echo "   npm run build:win"
echo ""
echo "For more information, see README.md"
echo ""
