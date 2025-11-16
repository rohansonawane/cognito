# AWS EC2 Deployment Checklist

Here's everything you need to deploy your app to AWS EC2:

## ✅ Required Information & Credentials

### 1. AWS Account Setup
- [ ] **AWS Account** - Sign up at [aws.amazon.com](https://aws.amazon.com)
- [ ] **Credit Card** - Required for signup (won't charge on free tier)
- [ ] **Phone Verification** - AWS will verify your phone number
- [ ] **Account Verification** - May take a few hours

### 2. API Keys (For Your App)
- [ ] **OpenAI API Key**
  - Get from: https://platform.openai.com/api-keys
  - Format: `sk-...`
  - Cost: Pay-as-you-go (you'll need credits)
  
- [ ] **Google Gemini API Key** (Optional but recommended)
  - Get from: https://makersuite.google.com/app/apikey
  - Format: `AIza...`
  - Cost: Free tier available

### 3. AWS EC2 Instance Details
You'll need to configure these when launching:

- [ ] **Instance Type**: `t2.micro` or `t3.micro` (free tier)
- [ ] **AMI**: Ubuntu 22.04 LTS (free tier eligible)
- [ ] **Key Pair**: Create and download `.pem` file (save it securely!)
- [ ] **Security Group**: Configure ports (see below)
- [ ] **Storage**: 20GB (free tier includes 30GB)

### 4. Security Group Ports
Configure these in EC2 Security Group:

- [ ] **SSH (22)** - From your IP only
- [ ] **HTTP (80)** - From anywhere (0.0.0.0/0)
- [ ] **HTTPS (443)** - From anywhere (0.0.0.0/0)
- [ ] **Custom TCP (8787)** - From anywhere (for API)

### 5. Environment Variables
You'll need to set these in `.env` file on the server:

```bash
OPENAI_API_KEY=sk-your-actual-key-here
GEMINI_API_KEY=your-actual-key-here
CORS_ORIGIN=*
PORT=8787
RATE_LIMIT_WINDOW_MS=86400000
RATE_LIMIT_MAX=10
MAX_IMAGE_MB=8
```

### 6. Domain Name (Optional)
- [ ] **Domain Name** (optional but recommended)
  - Free options: [Freenom](https://www.freenom.com) (.tk, .ml domains)
  - Paid: Namecheap, Cloudflare (~$1-10/year)
  - Or use EC2 public IP directly

---

## 📋 Step-by-Step Data Collection

### Step 1: Get AWS Account
1. Go to https://aws.amazon.com
2. Click "Create an AWS Account"
3. Enter email, password, account name
4. Add payment method (credit card)
5. Verify phone number
6. Choose support plan (Basic is free)
7. Wait for account activation (usually instant, sometimes hours)

**What you'll get:**
- AWS Account ID
- Root user email
- Access to AWS Console

### Step 2: Get API Keys

**OpenAI API Key:**
1. Go to https://platform.openai.com
2. Sign up/Login
3. Go to API Keys: https://platform.openai.com/api-keys
4. Click "Create new secret key"
5. Copy and save it securely (you can't see it again!)
6. Add billing credits (minimum $5)

**Gemini API Key:**
1. Go to https://makersuite.google.com/app/apikey
2. Sign in with Google account
3. Click "Create API Key"
4. Copy and save it

### Step 3: Launch EC2 Instance

**In AWS Console:**
1. Go to EC2 Dashboard
2. Click "Launch Instance"
3. Fill in:
   - **Name**: `ai-canvas-app`
   - **AMI**: Ubuntu Server 22.04 LTS (free tier)
   - **Instance Type**: t2.micro (free tier)
   - **Key Pair**: Create new, name it `ai-canvas-key`, download `.pem` file
   - **Network Settings**: 
     - Allow SSH from your IP
     - Allow HTTP/HTTPS from anywhere
   - **Storage**: 20GB gp3
4. Click "Launch Instance"

**What you'll get:**
- Instance ID (e.g., `i-0123456789abcdef0`)
- Public IPv4 address (e.g., `54.123.45.67`)
- Private key file (`.pem` file - save it securely!)

### Step 4: Connect to Instance

**You'll need:**
- Your `.pem` key file
- Your EC2 public IP address
- SSH client (built into Mac/Linux, PuTTY for Windows)

**Command:**
```bash
chmod 400 ai-canvas-key.pem
ssh -i ai-canvas-key.pem ubuntu@YOUR_EC2_IP
```

---

## 🔐 Security Checklist

Before deploying, make sure:

- [ ] **Key file is secure**: `chmod 400 your-key.pem`
- [ ] **Key file is backed up**: Save it in a secure location
- [ ] **Security Group configured**: Only necessary ports open
- [ ] **SSH only from your IP**: Don't allow SSH from anywhere
- [ ] **API keys are secure**: Never commit to Git
- [ ] **Environment variables set**: In `.env` file, not in code

---

## 📝 Quick Reference: All Data Needed

### Must Have:
1. ✅ AWS Account (email, password)
2. ✅ Credit Card (for verification, won't charge on free tier)
3. ✅ OpenAI API Key (`sk-...`)
4. ✅ Gemini API Key (optional: `AIza...`)
5. ✅ EC2 Key Pair (`.pem` file)
6. ✅ EC2 Public IP Address

### Nice to Have:
7. ⭐ Domain Name (optional)
8. ⭐ SSL Certificate (free with Let's Encrypt)

---

## 🚀 Deployment Data Flow

```
1. AWS Account
   ↓
2. Launch EC2 Instance
   ↓ Get: Public IP, Key Pair
   ↓
3. Connect via SSH
   ↓
4. Clone Repository
   ↓
5. Set Environment Variables
   ↓ Need: API Keys
   ↓
6. Build & Start App
   ↓
7. App Live at: http://YOUR_EC2_IP
```

---

## 💰 Cost Breakdown

**Free Tier (First 12 Months):**
- EC2 t2.micro: $0 (750 hours/month)
- EBS Storage: $0 (30GB)
- Data Transfer: $0 (15GB out/month)

**After Free Tier:**
- EC2 t2.micro: ~$8-10/month
- EBS 20GB: ~$2/month
- Data Transfer: $0.09/GB after 15GB

**Additional Costs:**
- OpenAI API: Pay-as-you-go (~$0.01-0.10 per request)
- Gemini API: Free tier available
- Domain: $0-10/year (optional)

**Total Free Tier Cost: $0** (just API usage)

---

## 📋 Pre-Deployment Checklist

Before you start, make sure you have:

- [ ] AWS account created and verified
- [ ] Credit card added (won't charge on free tier)
- [ ] OpenAI API key with credits added
- [ ] Gemini API key (optional)
- [ ] SSH client installed (Mac/Linux built-in, PuTTY for Windows)
- [ ] Git installed locally (for cloning repo)
- [ ] Basic terminal/command line knowledge

---

## 🆘 What If You Don't Have Something?

**No AWS Account?**
- Sign up at aws.amazon.com (takes 5-10 minutes)

**No API Keys?**
- OpenAI: Sign up, add $5-10 credits
- Gemini: Free, just need Google account

**No Credit Card?**
- AWS requires it for verification
- Won't charge on free tier
- Can use prepaid card if needed

**No Domain?**
- Not required! Use EC2 public IP directly
- Or get free domain from Freenom

---

## ✅ Ready to Deploy?

Once you have:
1. ✅ AWS Account
2. ✅ API Keys (OpenAI + Gemini)
3. ✅ EC2 Instance launched
4. ✅ Key pair downloaded

You're ready! Follow the `AWS_EC2_SETUP.md` guide or run `setup-ec2.sh` script.

---

## 📞 Quick Help

**AWS Issues:**
- AWS Support: https://aws.amazon.com/support
- EC2 Documentation: https://docs.aws.amazon.com/ec2/

**API Key Issues:**
- OpenAI: https://help.openai.com
- Gemini: https://ai.google.dev/docs

**Deployment Issues:**
- Check `AWS_EC2_SETUP.md` troubleshooting section
- Check PM2 logs: `pm2 logs ai-canvas`

---

**Summary: You mainly need AWS account, API keys, and the EC2 instance details. Everything else is automated by the setup script!** 🚀

