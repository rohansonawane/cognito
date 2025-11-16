# Quick Start: AWS EC2 Deployment

## 🎯 What You Need (5 Minutes Setup)

### Essential (Must Have):
1. **AWS Account** - Sign up at aws.amazon.com
2. **OpenAI API Key** - Get from platform.openai.com/api-keys
3. **EC2 Instance** - Launch from AWS Console

### Optional:
4. **Gemini API Key** - Get from makersuite.google.com/app/apikey
5. **Domain Name** - Free from freenom.com or paid

---

## ⚡ Super Quick Deploy (Copy-Paste)

### 1. Launch EC2 (AWS Console)
```
1. Go to: https://console.aws.amazon.com/ec2
2. Click "Launch Instance"
3. Name: ai-canvas-app
4. AMI: Ubuntu 22.04 LTS
5. Instance: t2.micro (free tier)
6. Key Pair: Create new → Download .pem file
7. Network: Allow HTTP/HTTPS from anywhere
8. Launch!
```

### 2. Connect & Deploy (Terminal)
```bash
# Connect to your instance
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@YOUR_EC2_IP

# Run setup script
curl -o- https://raw.githubusercontent.com/rohansonawane/cognito/main/setup-ec2.sh | bash

# Or manually:
git clone https://github.com/rohansonawane/cognito.git
cd cognito
bash setup-ec2.sh
```

### 3. Add API Keys
```bash
# Edit environment file
nano server/.env

# Add your keys:
OPENAI_API_KEY=sk-your-key-here
GEMINI_API_KEY=your-key-here
CORS_ORIGIN=*
PORT=8787

# Save (Ctrl+X, Y, Enter)
# Restart app
pm2 restart ai-canvas
```

### 4. Done! 🎉
Your app is live at: `http://YOUR_EC2_IP`

---

## 📊 Data Summary

| Item | Where to Get | Cost |
|------|-------------|------|
| AWS Account | aws.amazon.com | Free (12 months) |
| OpenAI Key | platform.openai.com | Pay-per-use |
| Gemini Key | makersuite.google.com | Free tier |
| EC2 Instance | AWS Console | Free tier |
| Domain | freenom.com | Free (optional) |

**Total Setup Cost: $0** (just API usage)

---

## 🔑 Keys You Need

```
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxx
```

That's it! Everything else is automated.

---

## ✅ Checklist

- [ ] AWS account created
- [ ] EC2 instance launched
- [ ] Key pair downloaded
- [ ] OpenAI API key obtained
- [ ] Connected to EC2 via SSH
- [ ] Setup script run
- [ ] API keys added to .env
- [ ] App restarted

**All set!** 🚀

