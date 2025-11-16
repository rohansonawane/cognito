# 🌐 Setup Hostinger Subdomain with AWS EC2

## Step 1: Point Your Subdomain to EC2 IP

1. **Log in to Hostinger**: https://www.hosteringer.com
2. **Go to DNS Management** (or Domain → DNS Zone Editor)
3. **Find your subdomain** (e.g., `app.yourdomain.com` or `canvas.yourdomain.com`)
4. **Add/Edit A Record**:
   - **Type**: A
   - **Name**: Your subdomain (e.g., `app` or `canvas` or `@` for root)
   - **Value/IP**: `3.12.155.210`
   - **TTL**: 3600 (or default)
5. **Save the record**

**Wait 5-15 minutes** for DNS to propagate.

## Step 2: Verify DNS is Working

Once DNS propagates, test:
```bash
nslookup your-subdomain.yourdomain.com
# or
dig your-subdomain.yourdomain.com
```

It should return: `3.12.155.210`

## Step 3: Get Let's Encrypt SSL Certificate

Once DNS is pointing correctly, run this on your EC2:

```bash
ssh -i ~/Downloads/Cognitoapp.pem ubuntu@ec2-3-12-155-210.us-east-2.compute.amazonaws.com

# Get SSL certificate
sudo certbot --nginx -d your-subdomain.yourdomain.com --non-interactive --agree-tos --email your-email@example.com --redirect
```

Replace:
- `your-subdomain.yourdomain.com` with your actual subdomain
- `your-email@example.com` with your email

## Step 4: Access Your App

After SSL is installed:
- **https://your-subdomain.yourdomain.com** ✅ (No browser warnings!)

---

## 📋 What I Need From You

Please provide:
1. **Your subdomain**: e.g., `app.yourdomain.com` or `canvas.yourdomain.com`
2. **Your email**: For Let's Encrypt certificate (can be any email)

Once you provide these, I'll help you set it up!

---

## ⚡ Quick Setup Commands

After DNS is pointing to your EC2 IP, I'll run:

```bash
sudo certbot --nginx -d YOUR-SUBDOMAIN --non-interactive --agree-tos --email YOUR-EMAIL --redirect
```

This will:
- ✅ Get a trusted SSL certificate (no browser warnings!)
- ✅ Configure Nginx automatically
- ✅ Set up HTTP → HTTPS redirect
- ✅ Auto-renew the certificate

---

**Share your subdomain and email, and I'll set it up!** 🚀

