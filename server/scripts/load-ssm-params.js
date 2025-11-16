#!/usr/bin/env node
/**
 * Load parameters from AWS Systems Manager Parameter Store and create .env file
 * 
 * Prerequisites:
 * 1. EC2 instance must have IAM role with SSM read access
 * 2. AWS SDK installed: npm install @aws-sdk/client-ssm
 * 3. Parameters stored in Parameter Store with prefix: /ai-canvas/
 * 
 * Usage:
 *   node scripts/load-ssm-params.js
 * 
 * Environment variables:
 *   AWS_REGION - AWS region (default: us-east-2)
 *   PARAM_PREFIX - Parameter prefix (default: /ai-canvas/)
 */

import { SSMClient, GetParametersCommand } from '@aws-sdk/client-ssm';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const region = process.env.AWS_REGION || 'us-east-2';
const prefix = process.env.PARAM_PREFIX || '/ai-canvas/';

const client = new SSMClient({ region });

// List of parameters to load
const paramNames = [
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'CORS_ORIGIN',
  'PORT',
  'RATE_LIMIT_WINDOW_MS',
  'RATE_LIMIT_MAX',
  'MAX_IMAGE_MB',
  'GEMINI_MODEL',
  'GEMINI_API_VERSION',
  'GEMINI_API_BASE'
].map(name => `${prefix}${name}`);

async function loadParams() {
  try {
    console.log(`🔐 Loading parameters from AWS Systems Manager...`);
    console.log(`   Region: ${region}`);
    console.log(`   Prefix: ${prefix}`);
    
    const response = await client.send(
      new GetParametersCommand({ 
        Names: paramNames,
        WithDecryption: true  // Decrypt SecureString parameters
      })
    );
    
    if (response.InvalidParameters && response.InvalidParameters.length > 0) {
      console.warn('⚠️  Some parameters not found:', response.InvalidParameters);
    }
    
    if (!response.Parameters || response.Parameters.length === 0) {
      throw new Error('No parameters found');
    }
    
    // Build .env file content
    const envContent = response.Parameters
      .map(param => {
        const key = param.Name.replace(prefix, '');
        return `${key}=${param.Value}`;
      })
      .join('\n') + '\n';
    
    // Write to .env file in server directory
    const serverDir = join(__dirname, '..');
    const envPath = join(serverDir, '.env');
    
    writeFileSync(envPath, envContent, { mode: 0o600, flag: 'w' });
    
    console.log('✅ Parameters loaded successfully');
    console.log(`   Created: ${envPath}`);
    console.log(`   Permissions: 600 (read/write owner only)`);
    
    // List loaded keys
    const keys = response.Parameters.map(p => p.Name.replace(prefix, ''));
    console.log(`   Loaded ${keys.length} environment variables: ${keys.join(', ')}`);
    
  } catch (error) {
    console.error('❌ Error loading parameters:', error.message);
    
    if (error.name === 'AccessDeniedException') {
      console.error('   Access denied. Check IAM role permissions.');
      console.error('   Required permission: ssm:GetParameters');
    } else if (error.name === 'InvalidKeyId') {
      console.error('   Invalid KMS key. Check parameter encryption settings.');
    } else {
      console.error('   Full error:', error);
    }
    
    process.exit(1);
  }
}

loadParams();

