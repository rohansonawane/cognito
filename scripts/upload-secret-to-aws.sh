#!/bin/bash
# Upload secrets to AWS Secrets Manager
# This script reads from a local .env file and uploads to AWS Secrets Manager
# Run this locally (not on EC2) to sync your secrets to AWS

set -e

SECRET_NAME="${1:-Environment_Key}"
REGION="${2:-us-east-2}"
ENV_FILE="${3:-server/.env}"

echo "🔐 Uploading secrets to AWS Secrets Manager..."
echo "   Secret Name: $SECRET_NAME"
echo "   Region: $REGION"
echo "   Source File: $ENV_FILE"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Install it first:"
    echo "   https://aws.amazon.com/cli/"
    exit 1
fi

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Environment file not found: $ENV_FILE"
    echo ""
    echo "Create it first with your API keys:"
    echo "  OPENAI_API_KEY=your_key_here"
    echo "  GEMINI_API_KEY=your_key_here"
    exit 1
fi

# Read .env file and convert to JSON
echo "📖 Reading environment variables from $ENV_FILE..."

# Build JSON object from .env file
SECRET_JSON="{"
FIRST=true

while IFS='=' read -r key value || [ -n "$key" ]; do
    # Skip empty lines and comments
    [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
    
    # Remove quotes from value if present
    value=$(echo "$value" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
    
    # Escape quotes in value for JSON
    value=$(echo "$value" | sed 's/"/\\"/g')
    
    if [ "$FIRST" = true ]; then
        FIRST=false
    else
        SECRET_JSON+=","
    fi
    
    SECRET_JSON+="\"$key\":\"$value\""
done < "$ENV_FILE"

SECRET_JSON+="}"

# Validate JSON (basic check)
if ! echo "$SECRET_JSON" | python3 -m json.tool > /dev/null 2>&1 && ! echo "$SECRET_JSON" | jq . > /dev/null 2>&1; then
    echo "⚠️  Warning: Could not validate JSON format, but proceeding..."
fi

# Check if secret already exists
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" &>/dev/null; then
    echo "📝 Secret '$SECRET_NAME' exists. Updating..."
    aws secretsmanager update-secret \
        --secret-id "$SECRET_NAME" \
        --secret-string "$SECRET_JSON" \
        --region "$REGION" > /dev/null
    echo "✅ Secret updated successfully!"
else
    echo "📝 Creating new secret '$SECRET_NAME'..."
    aws secretsmanager create-secret \
        --name "$SECRET_NAME" \
        --description "Environment variables for AI Canvas application" \
        --secret-string "$SECRET_JSON" \
        --region "$REGION" > /dev/null
    echo "✅ Secret created successfully!"
fi

echo ""
echo "📋 Secret contents (keys only):"
echo "$SECRET_JSON" | python3 -c "import sys, json; data=json.load(sys.stdin); print('\n'.join([f'  - {k}' for k in data.keys()]))" 2>/dev/null || \
echo "$SECRET_JSON" | jq -r 'keys[]' | sed 's/^/  - /' 2>/dev/null || \
echo "  (Unable to parse - check manually in AWS Console)"

echo ""
echo "✅ Upload complete!"
echo ""
echo "📋 Next steps:"
echo "1. Ensure EC2 instance has IAM role with SecretsManager read access"
echo "2. On EC2, run: cd server && node scripts/load-secrets.js"
echo "3. Restart your app: pm2 restart ai-canvas"
echo ""

