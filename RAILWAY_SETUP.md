# Railway Quick Setup Guide

Railway is the **best free option for students** - it's included in the GitHub Student Pack with $5/month free credit.

## 🚀 Quick Setup (5 minutes)

### Step 1: Get GitHub Student Pack (Optional but Recommended)
1. Go to https://education.github.com/pack
2. Sign up with your student email
3. Get verified (usually instant)
4. You'll get $5/month Railway credit + many other free services

### Step 2: Deploy on Railway

#### Option A: Single Server (Recommended - Uses 1 service)
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Click **"New Project"** → **"Deploy from GitHub repo"**
4. Select your `aicoderpad` repository
5. Railway will create a service - click on it
6. Go to **Settings** → **Build & Deploy**:
   - **Build Command**: `cd web && npm install && npm run build && cd ../server && npm install`
   - **Start Command**: `cd server && node src/index-combined.js`
   - **Root Directory**: `/` (root)
7. Go to **Variables** tab and add:
   ```
   OPENAI_API_KEY=your_key_here
   GEMINI_API_KEY=your_key_here
   CORS_ORIGIN=*
   PORT=10000
   ```
8. Click **Deploy** - Railway will automatically deploy!

#### Option B: Two Services (Separate Frontend & Backend)
1. Deploy backend first:
   - New Project → Deploy from GitHub
   - Select repo
   - Set **Root Directory** to `server`
   - **Start Command**: `node src/index.js`
   - Add environment variables
2. Deploy frontend:
   - New Project → Deploy from GitHub  
   - Select same repo
   - Set **Root Directory** to `web`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npx serve -s dist -l 3000`
   - Add variable: `VITE_API_URL=https://your-backend-url.railway.app`

### Step 3: Get Your URL
- Railway will give you a URL like: `https://your-app.railway.app`
- That's it! Your app is live! 🎉

## 💰 Pricing

- **Free Tier**: $5/month credit (enough for small apps)
- **Student Pack**: Additional $5/month = $10/month total
- **No credit card required** for free tier
- Services don't sleep (unlike Render)

## 🔧 Environment Variables

Add these in Railway dashboard → Variables:

```
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
CORS_ORIGIN=*
PORT=10000
RATE_LIMIT_WINDOW_MS=86400000
RATE_LIMIT_MAX=10
MAX_IMAGE_MB=8
```

## 📝 Notes

- Railway auto-deploys on every git push
- No sleeping - always responsive
- Free tier is generous for student projects
- Can upgrade later if needed

## 🆘 Troubleshooting

**Build fails?**
- Check that Node.js version is 18+
- Check build logs in Railway dashboard

**App not working?**
- Check environment variables are set
- Check logs in Railway dashboard
- Make sure frontend is built (`npm run build` in web/)

**Need help?**
- Railway has great docs: https://docs.railway.app
- Check Railway Discord for support

---

**That's it!** Your app should be live in minutes! 🚀

