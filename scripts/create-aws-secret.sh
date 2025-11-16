#!/bin/bash
# Helper script to create secrets in AWS Secrets Manager
# Run this locally (not on EC2) to set up your secrets

set -e

SECRET_NAME="${1:-Environment_Key}"
REGION="${2:-us-east-2}"

echo "🔐 Creating secret in AWS Secrets Manager..."
echo "   Name: $SECRET_NAME"
echo "   Region: $REGION"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Install it first:"
    echo "   https://aws.amazon.com/cli/"
    exit 1
fi

# Check if secret already exists
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" &>/dev/null; then
    echo "⚠️  Secret '$SECRET_NAME' already exists!"
    read -p "Do you want to update it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi
    UPDATE_MODE=true
else
    UPDATE_MODE=false
fi

# Prompt for secrets
echo ""
echo "Enter your API keys (press Enter to skip optional values):"
echo ""

read -p "OPENAI_API_KEY: " OPENAI_API_KEY
read -p "GEMINI_API_KEY: " GEMINI_API_KEY
read -p "CORS_ORIGIN [default: *]: " CORS_ORIGIN
CORS_ORIGIN=${CORS_ORIGIN:-*}

read -p "PORT [default: 8787]: " PORT
PORT=${PORT:-8787}

read -p "RATE_LIMIT_WINDOW_MS [default: 86400000]: " RATE_LIMIT_WINDOW_MS
RATE_LIMIT_WINDOW_MS=${RATE_LIMIT_WINDOW_MS:-86400000}

read -p "RATE_LIMIT_MAX [default: 10]: " RATE_LIMIT_MAX
RATE_LIMIT_MAX=${RATE_LIMIT_MAX:-10}

read -p "MAX_IMAGE_MB [default: 8]: " MAX_IMAGE_MB
MAX_IMAGE_MB=${MAX_IMAGE_MB:-8}

# Build JSON secret
SECRET_JSON=$(cat <<EOF
{
  "OPENAI_API_KEY": "$OPENAI_API_KEY",
  "GEMINI_API_KEY": "$GEMINI_API_KEY",
  "CORS_ORIGIN": "$CORS_ORIGIN",
  "PORT": "$PORT",
  "RATE_LIMIT_WINDOW_MS": "$RATE_LIMIT_WINDOW_MS",
  "RATE_LIMIT_MAX": "$RATE_LIMIT_MAX",
  "MAX_IMAGE_MB": "$MAX_IMAGE_MB"
}
EOF
)

# Create or update secret
if [ "$UPDATE_MODE" = true ]; then
    echo ""
    echo "📝 Updating secret..."
    aws secretsmanager update-secret \
        --secret-id "$SECRET_NAME" \
        --secret-string "$SECRET_JSON" \
        --region "$REGION" > /dev/null
    echo "✅ Secret updated successfully!"
else
    echo ""
    echo "📝 Creating secret..."
    aws secretsmanager create-secret \
        --name "$SECRET_NAME" \
        --description "Environment variables for AI Canvas application" \
        --secret-string "$SECRET_JSON" \
        --region "$REGION" > /dev/null
    echo "✅ Secret created successfully!"
fi

echo ""
echo "📋 Next steps:"
echo "1. Attach IAM role to your EC2 instance with SecretsManager read access"
echo "2. Run setup-ec2-secure.sh on your EC2 instance"
echo "3. The app will automatically load secrets from AWS Secrets Manager"
echo ""

