# 🌐 Setup cognito.shuruaat.in on Hostinger

## Step 1: Create Subdomain in Hostinger

1. **Log in to Hostinger**: https://www.hostinger.com
2. **Go to your domain**: Click on "shuruaat.in" domain
3. **Go to DNS Management**:
   - Look for "DNS Zone Editor" or "DNS Management" or "Advanced DNS"
   - Or go to: Domain → DNS Zone Editor

4. **Add A Record**:
   - Click "Add Record" or "+" button
   - **Type**: A
   - **Name**: `cognito` (or `cognito.shuruaat.in` - depends on Hostinger interface)
   - **Value/IP**: `3.12.155.210`
   - **TTL**: 3600 (or leave default)
   - **Save**

5. **Verify the record**:
   - You should see: `cognito` → `3.12.155.210` (Type A)

## Step 2: Wait for DNS Propagation

- **Wait 5-15 minutes** for DNS to propagate
- You can check with: `nslookup cognito.shuruaat.in` or `dig cognito.shuruaat.in`

## Step 3: I'll Set Up SSL Certificate

Once DNS is pointing correctly, I'll automatically:
- ✅ Get Let's Encrypt SSL certificate
- ✅ Configure Nginx for your domain
- ✅ Set up HTTP → HTTPS redirect
- ✅ Auto-renew certificate

---

**After you add the DNS record in Hostinger, let me know and I'll set up the SSL certificate!** 🚀

