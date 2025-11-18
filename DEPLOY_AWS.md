# AWS Deployment Guide

Quick reference for deploying latest code to AWS EC2 backend.

## Prerequisites

- SSH key: `~/Downloads/Cognitoapp.pem`
- AWS EC2 instance: `ec2-3-12-155-210.us-east-2.compute.amazonaws.com`
- User: `ubuntu`
- App directory: `~/cognito`

## Deployment Steps

### 1. Build Frontend Locally (Optional - for testing)
```bash
cd web
npm run build
```

### 2. Commit and Push to GitHub
```bash
cd /Users/rohan/Desktop/Projects/aicoderpad
git add -A
git commit -m "Your commit message"
git push origin main
```

### 3. Deploy to AWS

Run this single command to:
- Pull latest code from GitHub
- Build frontend on server
- Fix file permissions
- Restart PM2 process

```bash
ssh -i ~/Downloads/Cognitoapp.pem ubuntu@ec2-3-12-155-210.us-east-2.compute.amazonaws.com "cd ~/cognito && git pull && cd web && sudo chown -R ubuntu:ubuntu dist && npm run build && sudo chown -R www-data:www-data dist && cd .. && pm2 restart ai-canvas && echo '✅ Deployed successfully'"
```

## What This Does

1. **`cd ~/cognito`** - Navigate to app directory
2. **`git pull`** - Pull latest code from GitHub
3. **`cd web`** - Enter frontend directory
4. **`sudo chown -R ubuntu:ubuntu dist`** - Change ownership to ubuntu for building
5. **`npm run build`** - Build frontend production bundle
6. **`sudo chown -R www-data:www-data dist`** - Change ownership back to www-data for Nginx
7. **`cd ..`** - Go back to root
8. **`pm2 restart ai-canvas`** - Restart the Node.js backend service

## Check Deployment Status

```bash
ssh -i ~/Downloads/Cognitoapp.pem ubuntu@ec2-3-12-155-210.us-east-2.compute.amazonaws.com "pm2 status"
```

## View Logs

```bash
ssh -i ~/Downloads/Cognitoapp.pem ubuntu@ec2-3-12-155-210.us-east-2.compute.amazonaws.com "pm2 logs ai-canvas"
```

## Quick Deploy Script

Save this as `deploy.sh` in project root:

```bash
#!/bin/bash
ssh -i ~/Downloads/Cognitoapp.pem ubuntu@ec2-3-12-155-210.us-east-2.compute.amazonaws.com "cd ~/cognito && git pull && cd web && sudo chown -R ubuntu:ubuntu dist && npm run build && sudo chown -R www-data:www-data dist && cd .. && pm2 restart ai-canvas && echo '✅ Deployed successfully'"
```

Make it executable:
```bash
chmod +x deploy.sh
```

Then run:
```bash
./deploy.sh
```

## Troubleshooting

### If build fails:
- Check Node.js version on server: `node --version`
- Check npm version: `npm --version`
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`

### If PM2 restart fails:
- Check PM2 status: `pm2 status`
- View error logs: `pm2 logs ai-canvas --err`
- Restart manually: `pm2 restart ai-canvas`

### If file permissions issue:
- Fix ownership: `sudo chown -R www-data:www-data ~/cognito/web/dist`
- Check Nginx user: `ps aux | grep nginx`

## Server Details

- **App URL**: https://cognito.shuruaat.in
- **IP**: 3.12.155.210
- **Port**: 8787 (Node.js), 80/443 (Nginx)
- **PM2 Process**: `ai-canvas`
- **Frontend Build**: `~/cognito/web/dist`
- **Backend Server**: `~/cognito/server/src/index-combined.js`

