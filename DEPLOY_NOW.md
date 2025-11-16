# 🚀 Deploy to AWS EC2 - Step by Step

I'll guide you through each step. Follow along!

## Step 1: Get Your API Keys (5 minutes)

### OpenAI API Key:
1. Go to: https://platform.openai.com/api-keys
2. Sign up/Login
3. Click "Create new secret key"
4. Copy it (starts with `sk-`)
5. **Save it somewhere safe!**

### Gemini API Key (Optional):
1. Go to: https://makersuite.google.com/app/apikey
2. Sign in with Google
3. Click "Create API Key"
4. Copy it (starts with `AIza`)

**✅ Once you have these, tell me and we'll continue!**

---

## Step 2: Create AWS Account (10 minutes)

1. Go to: https://aws.amazon.com
2. Click "Create an AWS Account"
3. Enter your email and create password
4. Add payment method (won't charge on free tier)
5. Verify phone number
6. Choose "Basic Support" (free)
7. Wait for account activation

**✅ Once your AWS account is ready, tell me!**

---

## Step 3: Launch EC2 Instance (5 minutes)

I'll guide you through this in AWS Console:

1. **Go to EC2:**
   - In AWS Console, search "EC2" in top search bar
   - Click on "EC2" service

2. **Launch Instance:**
   - Click orange "Launch Instance" button
   - **Name**: Type `ai-canvas-app`

3. **Choose AMI:**
   - Search for "Ubuntu"
   - Select "Ubuntu Server 22.04 LTS" (free tier eligible)

4. **Instance Type:**
   - Select "t2.micro" (should say "Free tier eligible")

5. **Key Pair:**
   - Click "Create new key pair"
   - Name: `ai-canvas-key`
   - Key pair type: RSA
   - File format: .pem
   - Click "Create key pair"
   - **IMPORTANT**: The .pem file will download automatically - SAVE IT!

6. **Network Settings:**
   - Click "Edit"
   - Security group: Create new
   - Add these rules:
     - **SSH (22)**: My IP (your current IP)
     - **HTTP (80)**: Anywhere (0.0.0.0/0)
     - **HTTPS (443)**: Anywhere (0.0.0.0/0)
     - **Custom TCP (8787)**: Anywhere (0.0.0.0/0)

7. **Storage:**
   - Keep default 8GB (free tier includes 30GB)

8. **Launch:**
   - Click orange "Launch Instance" button
   - Wait for it to start (status will change to "Running")

9. **Get Your IP:**
   - Click on your instance
   - Copy the "Public IPv4 address" (looks like: 54.123.45.67)

**✅ Once you have the IP address and .pem file, tell me!**

---

## Step 4: Connect and Deploy (I'll give you exact commands)

Once you have:
- ✅ API Keys (OpenAI + Gemini)
- ✅ AWS Account
- ✅ EC2 Instance running
- ✅ Public IP address
- ✅ .pem key file downloaded

I'll give you the exact commands to run!

---

## What I Need From You:

1. **OpenAI API Key**: `sk-...` (you'll get this)
2. **Gemini API Key**: `AIza...` (optional)
3. **EC2 Public IP**: `54.xxx.xxx.xxx` (from AWS)
4. **Key file location**: Where you saved the .pem file

Once you have these, I'll give you the exact commands to deploy! 🚀

---

## Quick Status Check:

- [ ] OpenAI API key obtained
- [ ] Gemini API key obtained (optional)
- [ ] AWS account created
- [ ] EC2 instance launched
- [ ] Public IP address copied
- [ ] .pem key file downloaded

**Tell me when you're ready with these!** I'll guide you through the rest.

