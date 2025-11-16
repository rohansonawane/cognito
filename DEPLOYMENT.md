# Deployment Guide

This guide covers deploying the AI Canvas application to cloud platforms.

## Architecture

- **Frontend**: React + Vite app in `web/` directory
- **Backend**: Express.js API server in `server/` directory

## Option 1: Deploy on Render (Recommended - Both Services)

Render can host both the frontend and backend together.

### Backend Deployment (Render)

1. **Create a new Web Service** on Render:
   - Connect your GitHub repository
   - **Root Directory**: `server`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node src/index.js`
   - **Plan**: Free (or paid for better performance)

2. **Set Environment Variables**:
   ```
   OPENAI_API_KEY=your_openai_key_here
   GEMINI_API_KEY=your_gemini_key_here
   CORS_ORIGIN=https://cognito-web.onrender.com,https://your-site.netlify.app
   PORT=10000
   RATE_LIMIT_WINDOW_MS=86400000
   RATE_LIMIT_MAX=10
   MAX_IMAGE_MB=8
   ```

3. **Note the backend URL** (e.g., `https://cognito-api-xxxxx.onrender.com`)

### Frontend Deployment (Render Static Site)

1. **Create a new Static Site** on Render:
   - Connect your GitHub repository
   - **Root Directory**: `web`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`

2. **Set Environment Variable**:
   ```
   VITE_API_URL=https://cognito-api-xxxxx.onrender.com
   ```
   (Replace with your actual backend URL)

3. **Add Rewrite Rule** (in Render dashboard):
   - **Source**: `/api/*`
   - **Destination**: `https://cognito-api-xxxxx.onrender.com/api/*`

### Using render.yaml (Alternative)

You can use the `render.yaml` file for automatic deployment:

1. Push `render.yaml` to your repository
2. Render will automatically detect and create both services
3. Update environment variables in the Render dashboard

## Option 2: Deploy on Netlify (Frontend) + Render (Backend)

### Backend on Render

Follow the backend deployment steps from Option 1.

### Frontend on Netlify

1. **Create a new site** on Netlify:
   - Connect your GitHub repository
   - **Base directory**: `web`
   - **Build command**: `npm install && npm run build`
   - **Publish directory**: `dist`

2. **Set Environment Variable** (optional):
   ```
   VITE_API_URL=
   ```
   (Leave empty to use relative paths with redirects)

3. **Update netlify.toml**:
   - Update the redirect URL in `netlify.toml` to match your Render backend URL:
   ```toml
   [[redirects]]
     from = "/api/*"
     to = "https://your-backend-url.onrender.com/api/:splat"
     status = 200
     force = true
   ```

4. **Deploy**: Netlify will automatically deploy on push

## Option 3: Deploy Both on Vercel

Vercel can host both frontend and backend as serverless functions.

### Setup

1. **Install Vercel CLI**: `npm i -g vercel`

2. **Create vercel.json** in project root:
```json
{
  "builds": [
    {
      "src": "web/package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "dist"
      }
    },
    {
      "src": "server/src/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "server/src/index.js"
    },
    {
      "src": "/(.*)",
      "dest": "web/$1"
    }
  ]
}
```

3. **Deploy**: Run `vercel` in the project root

## Environment Variables Summary

### Backend (Server)
- `OPENAI_API_KEY` - Your OpenAI API key
- `GEMINI_API_KEY` - Your Google Gemini API key
- `CORS_ORIGIN` - Comma-separated list of allowed origins (or `*` for all)
- `PORT` - Server port (usually auto-set by platform)
- `RATE_LIMIT_WINDOW_MS` - Rate limit window in milliseconds (default: 24 hours)
- `RATE_LIMIT_MAX` - Max requests per window (default: 10)
- `MAX_IMAGE_MB` - Maximum image size in MB (default: 8)

### Frontend (Web)
- `VITE_API_URL` - Backend API URL (optional, uses relative paths if not set)

## Troubleshooting

### CORS Issues

If you see CORS errors:
1. Update `CORS_ORIGIN` in backend to include your frontend URL
2. For development, you can temporarily use `*` (not recommended for production)

### API Not Found (404)

1. Check that redirects/rewrites are configured correctly
2. Verify the backend URL in environment variables
3. Check that the backend is running and accessible

### Build Failures

1. Ensure Node.js version is 18+ (check `package.json` engines if specified)
2. Clear build cache and rebuild
3. Check for missing dependencies

## Quick Deploy Commands

### Render (using render.yaml)
```bash
# Just push to GitHub, Render will auto-deploy
git push origin main
```

### Netlify
```bash
# Install Netlify CLI
npm i -g netlify-cli

# Deploy
cd web
netlify deploy --prod
```

### Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

## Recommended Setup

For best results, use **Render for both services**:
- Simple configuration
- Free tier available
- Automatic deployments
- Easy environment variable management

