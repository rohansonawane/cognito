# 🔧 Fix AWS Security Group - Make App Accessible

Your app is running but not accessible because the Security Group is blocking traffic.

## Quick Fix in AWS Console (2 minutes)

### Step 1: Open AWS Console
1. Go to: https://console.aws.amazon.com/ec2
2. Make sure you're in **us-east-2** region (Ohio) - check top right

### Step 2: Find Your Instance
1. Click **"Instances"** in left menu
2. Find instance with IP: **3.12.155.210**
3. Click on it to select

### Step 3: Edit Security Group
1. Click **"Security"** tab at bottom
2. Click the **Security group** link (it's clickable, blue text)
3. Click **"Edit inbound rules"** button

### Step 4: Add Required Rules

**Delete any existing rules for ports 80, 443, 8787** (if they exist), then add these:

#### Rule 1: HTTP (Port 80)
- Click **"Add rule"**
- **Type**: HTTP
- **Protocol**: TCP
- **Port range**: 80
- **Source**: Anywhere-IPv4 (0.0.0.0/0)
- **Description**: Allow HTTP

#### Rule 2: HTTPS (Port 443)
- Click **"Add rule"**
- **Type**: HTTPS
- **Protocol**: TCP
- **Port range**: 443
- **Source**: Anywhere-IPv4 (0.0.0.0/0)
- **Description**: Allow HTTPS

#### Rule 3: Custom TCP (Port 8787) - **IMPORTANT**
- Click **"Add rule"**
- **Type**: Custom TCP
- **Protocol**: TCP
- **Port range**: 8787
- **Source**: Anywhere-IPv4 (0.0.0.0/0)
- **Description**: Allow app API

#### Rule 4: SSH (Port 22) - Should already exist
- Keep this one (for SSH access)
- **Source**: My IP (or your IP address)

### Step 5: Save
1. Click **"Save rules"** button
2. Wait 10-30 seconds for changes to apply

### Step 6: Test
Try accessing:
- **http://3.12.155.210:8787**
- **http://ec2-3-12-155-210.us-east-2.compute.amazonaws.com:8787**

---

## ✅ After Fixing Security Group

Your app will be accessible at:
- **http://3.12.155.210:8787**
- **http://ec2-3-12-155-210.us-east-2.compute.amazonaws.com:8787**

---

## 🆘 Still Not Working?

### Check 1: Verify App is Running
```bash
ssh -i ~/Downloads/Cognitoapp.pem ubuntu@ec2-3-12-155-210.us-east-2.compute.amazonaws.com
pm2 status
```

### Check 2: Test Locally on Server
```bash
curl http://localhost:8787/api/health
```
Should return: `{"ok":true}`

### Check 3: Verify Port is Listening
```bash
sudo netstat -tlnp | grep 8787
```

---

**The app is running correctly - you just need to open the Security Group ports!**

