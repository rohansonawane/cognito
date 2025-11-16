#!/bin/bash
# Deployment Commands for AWS EC2
# Run these commands one by one

echo "🚀 Starting deployment to AWS EC2..."

# Step 1: Connect to EC2 (run this locally first)
echo ""
echo "Step 1: Connect to EC2 instance"
echo "Run this command in your terminal:"
echo "ssh -i ~/Downloads/Cognitoapp.pem ubuntu@ec2-3-12-155-210.us-east-2.compute.amazonaws.com"
echo ""
echo "Press Enter once you're connected..."
read

# Step 2: Once connected, run these commands on the EC2 instance:
cat << 'EOF'

# ============================================
# RUN THESE COMMANDS ON YOUR EC2 INSTANCE
# ============================================

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

# Install PM2
sudo npm install -g pm2

# Clone your repository
git clone https://github.com/rohansonawane/cognito.git
cd cognito

# Build frontend
cd web
npm install
npm run build
cd ..

# Install backend dependencies
cd server
npm install
cd ..

# Create .env file (you'll need to add your API keys)
cd server
nano .env

# Add these lines (replace with your actual keys):
# OPENAI_API_KEY=your_key_here
# GEMINI_API_KEY=your_key_here
# CORS_ORIGIN=*
# PORT=8787
# RATE_LIMIT_WINDOW_MS=86400000
# RATE_LIMIT_MAX=10
# MAX_IMAGE_MB=8

# Save and exit (Ctrl+X, then Y, then Enter)

# Start the combined server
pm2 start src/index-combined.js --name "ai-canvas"

# Save PM2 configuration
pm2 save

# Set up PM2 to start on boot
pm2 startup
# Run the command it outputs (usually starts with "sudo env PATH=...")

# Check status
pm2 status
pm2 logs ai-canvas

EOF

echo ""
echo "✅ Deployment complete!"
echo "Your app should be available at: http://ec2-3-12-155-210.us-east-2.compute.amazonaws.com"
echo ""

