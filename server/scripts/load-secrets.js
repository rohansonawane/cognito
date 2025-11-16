#!/usr/bin/env node
/**
 * Load secrets from AWS Secrets Manager and create .env file
 * 
 * Prerequisites:
 * 1. EC2 instance must have IAM role with SecretsManager read access
 * 2. AWS SDK installed: npm install @aws-sdk/client-secrets-manager
 * 3. Secret stored in AWS Secrets Manager with name: Environment_Key
 * 
 * Usage:
 *   node scripts/load-secrets.js
 * 
 * Environment variables:
 *   AWS_REGION - AWS region (default: us-east-2)
 *   SECRET_NAME - Secret name in Secrets Manager (default: Environment_Key)
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const region = process.env.AWS_REGION || 'us-east-2';
const secretName = process.env.SECRET_NAME || 'Environment_Key';

const client = new SecretsManagerClient({ region });

async function loadSecrets() {
  try {
    console.log(`🔐 Loading secrets from AWS Secrets Manager...`);
    console.log(`   Region: ${region}`);
    console.log(`   Secret: ${secretName}`);
    
    const response = await client.send(
      new GetSecretValueCommand({ 
        SecretId: secretName,
        VersionStage: "AWSCURRENT" // Explicitly use current version
      })
    );
    
    if (!response.SecretString) {
      throw new Error('Secret string is empty');
    }
    
    // Parse the secret - handle both JSON and plain text formats
    let secrets;
    try {
      secrets = JSON.parse(response.SecretString);
    } catch (parseError) {
      // If not JSON, try parsing as plain key-value pairs
      // Format: KEY1=value1\nKEY2=value2
      const lines = response.SecretString.split('\n').filter(line => line.trim());
      secrets = {};
      for (const line of lines) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          secrets[match[1].trim()] = match[2].trim();
        }
      }
      if (Object.keys(secrets).length === 0) {
        throw new Error('Could not parse secret format. Expected JSON object or key=value pairs.');
      }
    }
    
    // Build .env file content
    const envContent = Object.entries(secrets)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n';
    
    // Write to .env file in server directory
    const serverDir = join(__dirname, '..');
    const envPath = join(serverDir, '.env');
    
    writeFileSync(envPath, envContent, { mode: 0o600, flag: 'w' });
    
    console.log('✅ Secrets loaded successfully');
    console.log(`   Created: ${envPath}`);
    console.log(`   Permissions: 600 (read/write owner only)`);
    
    // List loaded keys (without values)
    const keys = Object.keys(secrets);
    console.log(`   Loaded ${keys.length} environment variables: ${keys.join(', ')}`);
    
  } catch (error) {
    console.error('❌ Error loading secrets:', error.message);
    
    if (error.name === 'ResourceNotFoundException') {
      console.error(`   Secret "${secretName}" not found in region "${region}"`);
      console.error('   Create it in AWS Secrets Manager first.');
    } else if (error.name === 'AccessDeniedException') {
      console.error('   Access denied. Check IAM role permissions.');
      console.error('   Required permission: secretsmanager:GetSecretValue');
    } else if (error.name === 'InvalidRequestException') {
      console.error('   Invalid request. Check secret name and region.');
    } else {
      console.error('   Full error:', error);
    }
    
    process.exit(1);
  }
}

loadSecrets();

