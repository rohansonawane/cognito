# AWS EC2 Free Tier Setup Guide

Yes! AWS Free Tier EC2 works perfectly for your app. Here's how to set it up:

## 🆓 AWS Free Tier Details

**What you get:**
- **750 hours/month** of t2.micro or t3.micro instance (enough for 24/7)
- **30GB** EBS storage
- **2 million** I/O operations
- **15GB** data transfer out per month
- **Valid for 12 months** from account creation

**Perfect for:** Student projects, small apps, always-on hosting

---

## 🚀 Step-by-Step Setup

### Step 1: Create AWS Account
1. Go to [aws.amazon.com](https://aws.amazon.com)
2. Sign up (requires credit card, but won't charge on free tier)
3. Verify your account

### Step 2: Launch EC2 Instance

1. **Go to EC2 Dashboard**
   - Search "EC2" in AWS console
   - Click "Launch Instance"

2. **Configure Instance:**
   - **Name**: `ai-canvas-app`
   - **AMI**: Choose **Ubuntu 22.04 LTS** (free tier eligible)
   - **Instance Type**: **t2.micro** or **t3.micro** (free tier)
   - **Key Pair**: Create new key pair, download `.pem` file (save it!)
   - **Network Settings**: 
     - Allow SSH (port 22) from your IP
     - Allow HTTP (port 80) from anywhere (0.0.0.0/0)
     - Allow HTTPS (port 443) from anywhere (0.0.0.0/0)
     - Allow Custom TCP (port 8787) from anywhere (for your API)
   - **Storage**: 20GB gp3 (free tier includes 30GB)

3. **Launch Instance**

### Step 3: Connect to Your Instance

**On Mac/Linux:**
```bash
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@your-ec2-ip-address
```

**On Windows:**
- Use PuTTY or WSL
- Or use AWS Systems Manager Session Manager (no SSH needed)

### Step 4: Set Up the Server

Once connected, run these commands:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 (process manager to keep app running)
sudo npm install -g pm2

# Install Git
sudo apt install -y git

# Install Nginx (optional, for serving static files)
sudo apt install -y nginx
```

### Step 5: Clone and Set Up Your App

```bash
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
```

### Step 6: Configure Environment Variables

```bash
# Create .env file for backend
cd server
nano .env
```

Add these variables:
```
OPENAI_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
CORS_ORIGIN=*
PORT=8787
RATE_LIMIT_WINDOW_MS=86400000
RATE_LIMIT_MAX=10
MAX_IMAGE_MB=8
```

Save and exit (Ctrl+X, then Y, then Enter)

### Step 7: Option A - Use Combined Server (Recommended)

This serves both frontend and backend from one server:

```bash
# Start the combined server with PM2
cd server
pm2 start src/index-combined.js --name "ai-canvas"
pm2 save
pm2 startup  # Follow the instructions it gives you
```

### Step 7: Option B - Use Nginx + Separate Server

**Configure Nginx:**
```bash
sudo nano /etc/nginx/sites-available/default
```

Replace with:
```nginx
server {
    listen 80;
    server_name your-ec2-ip-or-domain;

    # Serve frontend
    location / {
        root /home/ubuntu/cognito/web/dist;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to backend
    location /api {
        proxy_pass http://localhost:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Test and restart nginx
sudo nginx -t
sudo systemctl restart nginx

# Start backend with PM2
cd ~/cognito/server
pm2 start src/index.js --name "ai-canvas-api"
pm2 save
pm2 startup
```

### Step 8: Set Up Auto-Restart

```bash
# PM2 will keep your app running
pm2 save
pm2 startup
# Run the command it outputs (usually something like: sudo env PATH=... pm2 startup systemd -u ubuntu --hp /home/ubuntu)
```

### Step 9: Get Your Public IP

In EC2 dashboard:
- Find your instance
- Copy the **Public IPv4 address**
- Your app is at: `http://your-ip-address`

---

## 🔒 Security Best Practices

### 1. Set Up Security Group Properly

**In EC2 Dashboard → Security Groups:**

- **Inbound Rules:**
  - SSH (22) - Only from your IP
  - HTTP (80) - From anywhere (0.0.0.0/0)
  - HTTPS (443) - From anywhere (0.0.0.0/0)
  - Custom TCP (8787) - From anywhere (if using direct API)

### 2. Use Domain Name (Optional but Recommended)

1. Get a free domain from:
   - [Freenom](https://www.freenom.com) - Free .tk, .ml domains
   - [Namecheap](https://www.namecheap.com) - $1-2/year domains
   - [Cloudflare](https://www.cloudflare.com) - Domain registration

2. Point domain to your EC2 IP:
   - Add A record: `@` → your EC2 IP
   - Add A record: `www` → your EC2 IP

3. Update CORS_ORIGIN in .env:
   ```
   CORS_ORIGIN=https://yourdomain.com,http://yourdomain.com
   ```

### 3. Set Up SSL/HTTPS (Free with Let's Encrypt)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal is set up automatically
```

---

## 📊 Monitoring & Management

### Check if App is Running
```bash
pm2 status
pm2 logs ai-canvas
```

### Restart App
```bash
pm2 restart ai-canvas
```

### View Logs
```bash
pm2 logs ai-canvas --lines 50
```

### Update Your App
```bash
cd ~/cognito
git pull
cd web && npm run build && cd ..
pm2 restart ai-canvas
```

---

## 💰 Cost Management

**Free Tier Limits:**
- ✅ 750 hours/month (enough for 24/7)
- ✅ 30GB storage
- ✅ 15GB data transfer out

**To avoid charges:**
1. Use only t2.micro or t3.micro
2. Stay within 30GB storage
3. Monitor data transfer (15GB/month)
4. Set up billing alerts in AWS

**Set up billing alerts:**
1. Go to AWS Billing Dashboard
2. Create budget alert at $1
3. Get notified if you exceed free tier

---

## 🆘 Troubleshooting

### App not accessible?
```bash
# Check if app is running
pm2 status

# Check if port is listening
sudo netstat -tlnp | grep 8787

# Check nginx (if using)
sudo systemctl status nginx
sudo nginx -t
```

### Can't connect via SSH?
- Check Security Group allows SSH from your IP
- Verify you're using correct key file
- Check instance is running

### Out of memory?
- t2.micro has 1GB RAM
- If app crashes, consider:
  - Using the combined server (less memory)
  - Upgrading to t3.micro (still free tier)
  - Optimizing your app

### App crashes?
```bash
# Check PM2 logs
pm2 logs ai-canvas --err

# Restart app
pm2 restart ai-canvas
```

---

## ✅ Quick Setup Script

Save this as `setup.sh` and run it on your EC2 instance:

```bash
#!/bin/bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

# Install PM2
sudo npm install -g pm2

# Clone repo (replace with your repo URL)
git clone https://github.com/rohansonawane/cognito.git
cd cognito

# Build frontend
cd web && npm install && npm run build && cd ..

# Install backend deps
cd server && npm install && cd ..

# Create .env file (you'll need to edit this)
cd server
cat > .env << EOF
OPENAI_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
CORS_ORIGIN=*
PORT=8787
EOF

# Start app
pm2 start src/index-combined.js --name "ai-canvas"
pm2 save
pm2 startup

echo "Setup complete! Edit server/.env with your API keys and restart: pm2 restart ai-canvas"
```

---

## 🎯 Summary

**AWS EC2 Free Tier is perfect for:**
- ✅ Always-on hosting (24/7)
- ✅ Full control over server
- ✅ Learning server management
- ✅ Student projects
- ✅ Small to medium traffic apps

**Pros:**
- 12 months free
- Always-on (no sleeping)
- Full server control
- Can host multiple apps

**Cons:**
- Requires server management knowledge
- Need to set up SSL yourself
- More setup steps than Railway/Render

**Recommendation:** If you want to learn server management, EC2 is great! If you want the easiest setup, use Railway instead.

---

## 📚 Additional Resources

- [AWS Free Tier Guide](https://aws.amazon.com/free/)
- [EC2 Documentation](https://docs.aws.amazon.com/ec2/)
- [PM2 Documentation](https://pm2.keymetrics.io/)
- [Nginx Documentation](https://nginx.org/en/docs/)

---

**Your app will be live at:** `http://your-ec2-ip-address` 🚀

