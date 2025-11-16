# Free Student Hosting Options

Here are the best free hosting services for students that can host both frontend and backend together:

## 🏆 Best Options for Students

### 1. **Railway** (Highly Recommended)
- **Free Tier**: $5/month credit (enough for small apps)
- **Student Discount**: Yes - GitHub Student Pack includes additional credits
- **Pros**: 
  - Can host both frontend and backend
  - Auto-deploys from GitHub
  - No credit card required for free tier
  - Good documentation
- **Cons**: Free tier has limited resources
- **Best For**: Production-ready apps with moderate traffic

**Setup**: Just connect GitHub repo, Railway auto-detects and deploys

---

### 2. **Fly.io** (Great for Students)
- **Free Tier**: 3 shared-cpu VMs, 3GB persistent volumes
- **Student Discount**: No, but generous free tier
- **Pros**:
  - Can host both frontend and backend
  - Global edge network
  - Good performance
  - No sleep/restart issues
- **Cons**: Requires credit card (but won't charge on free tier)
- **Best For**: Apps needing global distribution

---

### 3. **Render** (Current Setup)
- **Free Tier**: Free web services (sleep after 15 min inactivity)
- **Student Discount**: No
- **Pros**:
  - Already configured in your repo
  - Can host both services
  - Easy setup
- **Cons**: Services sleep after inactivity (slow first request)
- **Best For**: Development/testing, low-traffic apps

---

### 4. **Cyclic** (Node.js Focused)
- **Free Tier**: Unlimited apps, always-on
- **Student Discount**: No
- **Pros**:
  - Always-on (no sleeping)
  - Auto-deploys from GitHub
  - Built for Node.js
- **Cons**: Only supports Node.js/Python
- **Best For**: Node.js apps that need always-on

---

### 5. **Replit** (Student-Friendly)
- **Free Tier**: Always-on repls for students
- **Student Discount**: Yes - GitHub Student Pack
- **Pros**:
  - Great for students
  - Built-in IDE
  - Can host full-stack apps
- **Cons**: Less flexible than traditional hosting
- **Best For**: Learning and prototyping

---

### 6. **Glitch** (Simple & Free)
- **Free Tier**: Free hosting, sleeps after 5 min
- **Student Discount**: No
- **Pros**:
  - Very easy to use
  - Instant remix/clone
  - Good for prototypes
- **Cons**: Projects sleep after inactivity
- **Best For**: Quick prototypes and demos

---

## 🎓 GitHub Student Developer Pack

If you're a student, get the **GitHub Student Developer Pack** which includes:
- **Railway**: $5/month credit (free)
- **Heroku**: Credits (limited free tier)
- **DigitalOcean**: $200 credit
- **AWS**: $75-200 credit
- **Azure**: $100 credit
- **And many more!**

**Sign up**: https://education.github.com/pack

---

## 📋 Comparison Table

| Service | Free Tier | Sleep? | Credit Card? | Student Discount | Best For |
|---------|-----------|--------|--------------|------------------|----------|
| **Railway** | $5/month credit | No | No | ✅ Yes | Production apps |
| **Fly.io** | 3 VMs, 3GB | No | Yes | ❌ No | Global apps |
| **Render** | Free services | Yes (15min) | No | ❌ No | Dev/testing |
| **Cyclic** | Unlimited | No | No | ❌ No | Node.js apps |
| **Replit** | Always-on (students) | No | No | ✅ Yes | Learning |
| **Glitch** | Free | Yes (5min) | No | ❌ No | Prototypes |

---

## 🚀 Recommended Setup for Your App

### Option A: Railway (Best Overall)
1. Sign up at [railway.app](https://railway.app)
2. Connect GitHub repo
3. Railway auto-detects both services
4. Set environment variables
5. Done!

### Option B: Fly.io (Best Performance)
1. Sign up at [fly.io](https://fly.io)
2. Install CLI: `curl -L https://fly.io/install.sh | sh`
3. Run `fly launch` in project root
4. Follow prompts

### Option C: Cyclic (Easiest for Node.js)
1. Sign up at [cyclic.sh](https://cyclic.sh)
2. Connect GitHub repo
3. Auto-deploys both frontend and backend
4. Set environment variables

---

## 💡 Quick Setup: Railway (Recommended)

Since you already have the code, here's the fastest way:

1. **Sign up**: Go to [railway.app](https://railway.app) and sign up with GitHub
2. **New Project**: Click "New Project" → "Deploy from GitHub repo"
3. **Select Repo**: Choose your `aicoderpad` repository
4. **Railway will detect**:
   - Backend service (from `server/` directory)
   - Frontend service (from `web/` directory)
5. **Set Environment Variables**:
   - `OPENAI_API_KEY`
   - `GEMINI_API_KEY`
   - `CORS_ORIGIN` (set to your Railway frontend URL)
6. **Deploy**: Railway automatically deploys both!

Railway will give you URLs for both services. Update the frontend to use the backend URL.

---

## 🔧 Alternative: Single Server Setup

If you want to host both on ONE server (not separate services), you can:

1. **Combine them**: Serve the frontend as static files from the Express server
2. **Use a service like Fly.io or Railway** with a single service
3. **Or use Vercel** with serverless functions for the backend

Would you like me to create a single-server configuration for any of these platforms?

---

## 📝 Notes

- **Render** (current setup) is free but services sleep - first request after sleep is slow
- **Railway** with student pack is best for always-on apps
- **Fly.io** requires credit card but won't charge on free tier
- Most services auto-deploy from GitHub on push

---

## 🎯 My Recommendation

**For students**: Use **Railway** with GitHub Student Pack
- Free $5/month credit
- No sleeping
- Easy setup
- Can host both services
- Auto-deploys from GitHub

**Second choice**: **Fly.io** if you need better performance/global distribution

Let me know which platform you'd like to use, and I can help set it up!

