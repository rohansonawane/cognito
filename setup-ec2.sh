#!/bin/bash
# AWS EC2 Setup Script for AI Canvas App
# Run this on your EC2 instance after connecting via SSH

set -e  # Exit on error

echo "🚀 Starting AI Canvas setup on EC2..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
echo "📦 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js installation
node --version
npm --version

# Install PM2
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Install Git (if not already installed)
echo "📦 Installing Git..."
sudo apt install -y git

# Clone repository (update with your repo URL)
echo "📥 Cloning repository..."
if [ ! -d "cognito" ]; then
    git clone https://github.com/rohansonawane/cognito.git
fi
cd cognito

# Build frontend
echo "🏗️  Building frontend..."
cd web
npm install
npm run build
cd ..

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd server
npm install
cd ..

# Create .env file template
echo "📝 Creating .env file template..."
cd server
if [ ! -f ".env" ]; then
    cat > .env << 'EOF'
# API Keys - Replace with your actual keys
OPENAI_API_KEY=your_openai_key_here
GEMINI_API_KEY=your_gemini_key_here

# Server Configuration
CORS_ORIGIN=*
PORT=8787
RATE_LIMIT_WINDOW_MS=86400000
RATE_LIMIT_MAX=10
MAX_IMAGE_MB=8
EOF
    echo "✅ Created .env file. Please edit it with your API keys:"
    echo "   nano server/.env"
else
    echo "⚠️  .env file already exists, skipping..."
fi
cd ..

# Start the combined server
echo "🚀 Starting application..."
cd server
pm2 start src/index-combined.js --name "ai-canvas"

# Save PM2 configuration
pm2 save

# Set up PM2 to start on boot
echo "⚙️  Setting up PM2 startup..."
STARTUP_CMD=$(pm2 startup | grep "sudo" | tail -1)
if [ ! -z "$STARTUP_CMD" ]; then
    eval $STARTUP_CMD
fi

# Get public IP
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Edit server/.env with your API keys:"
echo "   nano server/.env"
echo ""
echo "2. Restart the app:"
echo "   pm2 restart ai-canvas"
echo ""
echo "3. Your app should be available at:"
echo "   http://$PUBLIC_IP"
echo ""
echo "4. Check app status:"
echo "   pm2 status"
echo ""
echo "5. View logs:"
echo "   pm2 logs ai-canvas"
echo ""

