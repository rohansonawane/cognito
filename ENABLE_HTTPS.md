# 🔒 Enable HTTPS Access

HTTPS is configured on your server, but you need to open port 443 in AWS Security Group.

## ✅ Step 1: Open Port 443 in Security Group

1. **Go to AWS Console**: https://console.aws.amazon.com/ec2
2. **Select Region**: Make sure you're in **us-east-2** (Ohio)
3. **Click "Instances"** in left menu
4. **Select your instance** (IP: 3.12.155.210)
5. **Click "Security" tab** at bottom
6. **Click the Security group link** (blue, clickable text)
7. **Click "Edit inbound rules"**
8. **Click "Add rule"**:
   - **Type**: HTTPS
   - **Protocol**: TCP
   - **Port range**: 443
   - **Source**: Anywhere-IPv4 (0.0.0.0/0)
   - **Description**: Allow HTTPS traffic
9. **Click "Save rules"**
10. **Wait 10-30 seconds** for changes to apply

## ✅ Step 2: Access via HTTPS

After opening port 443, try:
- **https://3.12.155.210**
- **https://ec2-3-12-155-210.us-east-2.compute.amazonaws.com**

## ⚠️ Browser Security Warning (Expected)

Since we're using a **self-signed certificate**, your browser will show a warning:

### Chrome/Edge:
1. Click **"Advanced"**
2. Click **"Proceed to 3.12.155.210 (unsafe)"**

### Firefox:
1. Click **"Advanced"**
2. Click **"Accept the Risk and Continue"**

### Safari:
1. Click **"Show Details"**
2. Click **"visit this website"**

**This is normal!** The connection is still encrypted. The warning appears because the certificate isn't from a trusted authority (like Let's Encrypt).

## 🔐 For Trusted Certificate (No Warning)

To get a trusted SSL certificate without browser warnings:

1. **Get a domain name**:
   - Free: [Freenom](https://www.freenom.com) (.tk, .ml, .ga domains)
   - Paid: [Namecheap](https://www.namecheap.com) or [Cloudflare](https://www.cloudflare.com) (~$1-10/year)

2. **Point domain to your IP**: 
   - Add A record: `yourdomain.com` → `3.12.155.210`

3. **Get Let's Encrypt certificate**:
   ```bash
   ssh -i ~/Downloads/Cognitoapp.pem ubuntu@ec2-3-12-155-210.us-east-2.compute.amazonaws.com
   sudo certbot --nginx -d yourdomain.com
   ```

## ✅ Current Status

- ✅ **HTTP (port 80)**: Working - http://3.12.155.210
- ✅ **HTTPS (port 443)**: Configured, needs Security Group rule
- ✅ **SSL Certificate**: Self-signed (will show browser warning)
- ✅ **Auto-redirect**: HTTP → HTTPS (once port 443 is open)

---

**Once you open port 443, HTTPS will work!** 🚀

