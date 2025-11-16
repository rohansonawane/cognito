#!/bin/bash
# AWS EC2 Secure Setup Script for AI Canvas App
# This script sets up the application using AWS Secrets Manager for secure .env management
# Run this on your EC2 instance after connecting via SSH

set -e  # Exit on error

echo "🚀 Starting AI Canvas secure setup on EC2..."

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "📦 Installing AWS CLI..."
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
    unzip -q awscliv2.zip
    sudo ./aws/install
    rm -rf aws awscliv2.zip
    echo "✅ AWS CLI installed"
else
    echo "✅ AWS CLI already installed"
fi

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
echo "📦 Installing Node.js 20..."
if ! command -v node &> /dev/null || [ "$(node --version | cut -d'v' -f2 | cut -d'.' -f1)" != "20" ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi

# Verify Node.js installation
node --version
npm --version

# Install PM2
echo "📦 Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi

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

# Install AWS SDK for Secrets Manager
echo "📦 Installing AWS SDK..."
npm install @aws-sdk/client-secrets-manager

# Check if secrets can be loaded
echo "🔐 Checking AWS Secrets Manager access..."
if node scripts/load-secrets.js 2>/dev/null; then
    echo "✅ Secrets loaded from AWS Secrets Manager"
else
    echo "⚠️  Could not load secrets from AWS Secrets Manager"
    echo ""
    echo "Options:"
    echo "1. Create secret in AWS Secrets Manager:"
    echo "   aws secretsmanager create-secret \\"
    echo "     --name Environment_Key \\"
    echo "     --secret-string '{\"OPENAI_API_KEY\":\"...\",\"GEMINI_API_KEY\":\"...\"}'"
    echo ""
    echo "2. Or create .env file manually:"
    echo "   nano .env"
    echo ""
    echo "3. Or use Parameter Store (see AWS_SECURE_ENV.md)"
    echo ""
    read -p "Press Enter to continue (you can create .env manually later)..."
fi

cd ..

# Start the combined server
echo "🚀 Starting application..."
cd server
pm2 start src/index-combined.js --name "ai-canvas" || pm2 restart ai-canvas

# Save PM2 configuration
pm2 save

# Set up PM2 to start on boot
echo "⚙️  Setting up PM2 startup..."
if ! pm2 startup | grep -q "already setup"; then
    STARTUP_CMD=$(pm2 startup | grep "sudo" | tail -1)
    if [ ! -z "$STARTUP_CMD" ]; then
        eval $STARTUP_CMD
    fi
fi

# Get public IP
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 || echo "unknown")

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo ""
echo "1. If using AWS Secrets Manager:"
echo "   - Ensure IAM role is attached to EC2 instance"
echo "   - Secret should be named: Environment_Key"
echo "   - Restart app: pm2 restart ai-canvas"
echo ""
echo "2. If using .env file:"
echo "   - Edit server/.env with your API keys:"
echo "     nano server/.env"
echo "   - Restart app: pm2 restart ai-canvas"
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
echo "📚 For more secure options, see AWS_SECURE_ENV.md"
echo ""

