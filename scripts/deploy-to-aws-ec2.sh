#!/bin/bash
# Deploy application to AWS EC2
# This script uploads your code to EC2 and sets it up
# Run this locally (requires SSH access to EC2)

set -e

# Configuration - UPDATE THESE VALUES
EC2_HOST="${EC2_HOST:-ubuntu@ec2-3-12-155-210.us-east-2.compute.amazonaws.com}"
EC2_KEY="${EC2_KEY:-~/Downloads/Cognitoapp.pem}"
EC2_REMOTE_DIR="${EC2_REMOTE_DIR:-~/cognito}"

echo "🚀 Deploying to AWS EC2..."
echo "   Host: $EC2_HOST"
echo "   Key: $EC2_KEY"
echo "   Remote Directory: $EC2_REMOTE_DIR"
echo ""

# Check if SSH key exists
if [ ! -f "$EC2_KEY" ]; then
    echo "❌ SSH key not found: $EC2_KEY"
    echo "   Set EC2_KEY environment variable or update the script"
    exit 1
fi

# Check if we can connect
echo "🔌 Testing SSH connection..."
if ! ssh -i "$EC2_KEY" -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$EC2_HOST" "echo 'Connected'" &>/dev/null; then
    echo "❌ Cannot connect to EC2 instance"
    echo "   Check:"
    echo "   1. EC2_HOST is correct"
    echo "   2. EC2_KEY path is correct"
    echo "   3. Security group allows SSH (port 22)"
    echo "   4. Instance is running"
    exit 1
fi
echo "✅ SSH connection successful"
echo ""

# Create deployment archive (exclude node_modules, .env, etc.)
echo "📦 Creating deployment archive..."
TEMP_DIR=$(mktemp -d)
ARCHIVE="$TEMP_DIR/deploy.tar.gz"

# Create archive excluding unnecessary files
tar --exclude='node_modules' \
    --exclude='.env' \
    --exclude='.git' \
    --exclude='dist' \
    --exclude='build' \
    --exclude='*.log' \
    --exclude='.DS_Store' \
    -czf "$ARCHIVE" \
    -C "$(dirname "$(pwd)")" \
    "$(basename "$(pwd)")" 2>/dev/null || {
    # Fallback: create archive from current directory
    tar --exclude='node_modules' \
        --exclude='.env' \
        --exclude='.git' \
        --exclude='dist' \
        --exclude='build' \
        --exclude='*.log' \
        --exclude='.DS_Store' \
        -czf "$ARCHIVE" . 2>/dev/null
}

if [ ! -f "$ARCHIVE" ]; then
    echo "❌ Failed to create archive"
    exit 1
fi

ARCHIVE_SIZE=$(du -h "$ARCHIVE" | cut -f1)
echo "✅ Archive created: $ARCHIVE_SIZE"
echo ""

# Upload archive to EC2
echo "📤 Uploading to EC2..."
scp -i "$EC2_KEY" "$ARCHIVE" "$EC2_HOST:/tmp/deploy.tar.gz"
echo "✅ Upload complete"
echo ""

# Extract and setup on EC2
echo "🔧 Setting up on EC2..."
ssh -i "$EC2_KEY" "$EC2_HOST" << 'ENDSSH'
set -e

# Create directory if it doesn't exist
mkdir -p ~/cognito
cd ~/cognito

# Backup existing if it exists
if [ -d "backup" ]; then
    rm -rf backup
fi
if [ -d "current" ] && [ "$(ls -A current 2>/dev/null)" ]; then
    mv current backup
fi
mkdir -p current

# Extract archive
echo "📦 Extracting files..."
tar -xzf /tmp/deploy.tar.gz -C current --strip-components=1 2>/dev/null || \
tar -xzf /tmp/deploy.tar.gz -C current

# Clean up archive
rm -f /tmp/deploy.tar.gz

# Install dependencies and build
echo "📦 Installing dependencies..."
cd current/server
if [ -f "package.json" ]; then
    npm install
    npm install @aws-sdk/client-secrets-manager 2>/dev/null || true
fi

# Load secrets from AWS Secrets Manager
echo "🔐 Loading secrets from AWS..."
if [ -f "scripts/load-secrets.js" ]; then
    node scripts/load-secrets.js || echo "⚠️  Could not load secrets (may need IAM role setup)"
fi

# Build frontend if web directory exists
if [ -d "../../web" ]; then
    echo "🏗️  Building frontend..."
    cd ../../web
    if [ -f "package.json" ]; then
        npm install
        npm run build || echo "⚠️  Frontend build failed (may need manual setup)"
    fi
fi

# Restart application with PM2
echo "🚀 Restarting application..."
cd ~/cognito/current/server

# Stop existing app if running
pm2 delete ai-canvas 2>/dev/null || true

# Start new app
if [ -f "src/index-combined.js" ]; then
    pm2 start src/index-combined.js --name "ai-canvas" || \
    pm2 restart ai-canvas || true
elif [ -f "src/index.js" ]; then
    pm2 start src/index.js --name "ai-canvas" || \
    pm2 restart ai-canvas || true
fi

pm2 save

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Application status:"
pm2 status
echo ""
echo "📋 View logs: pm2 logs ai-canvas"
ENDSSH

# Clean up local archive
rm -f "$ARCHIVE"
rmdir "$TEMP_DIR" 2>/dev/null || true

echo ""
echo "✅ Deployment to AWS EC2 complete!"
echo ""
echo "📋 Next steps:"
echo "1. Check application: ssh -i $EC2_KEY $EC2_HOST 'pm2 status'"
echo "2. View logs: ssh -i $EC2_KEY $EC2_HOST 'pm2 logs ai-canvas'"
echo "3. Access your app at: http://$(echo $EC2_HOST | cut -d'@' -f2 | cut -d'.' -f1)"
echo ""

