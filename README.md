<div align="center">

<img src="web/src/assets/Logo.png" alt="Cognito" height="56" />

<h1>AI Canvas Lab</h1>
<p>Sketch. Solve. Describe. A modern, themeable canvas with AI assistance for web, native, and static deployments.</p>

</div>

## Table of Contents
- [Overview](#overview)
- [Feature Highlights](#feature-highlights)
- [System Architecture](#system-architecture)
- [Repository Layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
  - [1. API proxy server](#1-api-proxy-server)
  - [2. Web client](#2-web-client)
  - [3. Expo native app (optional)](#3-expo-native-app-optional)
  - [4. Static HTML preview (optional)](#4-static-html-preview-optional)
- [Configuration](#configuration)
- [Deployment](#deployment)
  - [Render (API)](#render-api)
  - [Netlify (Web)](#netlify-web)
- [Using the Canvas](#using-the-canvas)
  - [Tools & interactions](#tools--interactions)
  - [Keyboard shortcuts](#keyboard-shortcuts)
- [Security & Performance](#security--performance)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Overview
AI Canvas Lab (codename Cognito) is a cross-platform whiteboard that blends layered drawing, quick exporting, and AI-powered analysis via OpenAI and Google Gemini. The repository contains:

- A production-ready web app built with React, Vite, and TypeScript.
- An Express proxy that shields API keys, enforces rate limits, and validates image payloads.
- An Expo/React Native experience for Android (works with Expo Go).
- A standalone static HTML build for lightweight demos.

The experience focuses on fluid input (pointer pressure smoothing, responsive controls), a unified blue theme with light/dark support, and fast integrations to ask AI for insights or solutions based on your sketches.

## Feature Highlights
- Layered canvas pipeline (background, draw, overlay) with smooth strokes and live preview for lines, rectangles, and ellipses.
- Brush family: brush, marker, highlighter, eraser with adjustable size and color palette (custom color picker).
- Drag-and-drop image upload, local board history, undo/redo stack, and PNG export.
- Ask AI workflow with optional prompt, provider toggle (OpenAI/Gemini), animated feedback, and clipboard copy of responses.
- Responsive layout with keyboard shortcuts, zoom controls, and theme persistence.
- Security-focused proxy: rate limiting, payload validation, CORS allow-list, and header hardening.
- Deployable across Render (API), Netlify (web), and Expo (mobile) with minimal configuration.

## System Architecture
- **Web (`web/`)** – React + Vite + TypeScript UI, Lucide icons, Tailwind-compatible design tokens in plain CSS.
- **API proxy (`server/`)** – Express server that validates data URLs, calls OpenAI (`gpt-4o-mini`) or Gemini (`gemini-1.5-flash` by default), and normalizes the response.
- **Mobile (`mobile/`)** – Expo/React Native drawing surface powered by `@shopify/react-native-skia`, capturing the canvas and submitting it to the proxy.
- **Static preview (repo root)** – Vanilla JS implementation (`index.html`, `app.js`, `canvasEngine.js`, `aiAdapter.js`) for quick demos or embedding in docs.

All AI traffic flows through the proxy so that keys never reach the client, and provider-specific prompts/output shaping are centralized.

## Repository Layout
```
.
├─ index.html / app.js / canvasEngine.js     # Static demo (no build step)
├─ web/                                      # Vite + React web client
│  ├─ src/App.tsx                            # Root application shell
│  ├─ src/components/                        # Canvas tools and UI widgets
│  ├─ src/ai/api.ts                          # `/api/analyze` fetch wrapper
│  └─ src/styles.css                         # Theme tokens & layout
├─ server/                                   # Express proxy
│  └─ src/index.js                           # Routes + provider adapters
├─ mobile/                                   # Expo (Android focus)
│  └─ src/screens/CanvasScreen.tsx           # Skia canvas + Ask AI flow
├─ native/                                   # Legacy RN scaffold (Expo)
├─ netlify.toml                              # Build & redirect config for web
├─ render.yaml                               # Render blueprint for API server
└─ design.json                               # Design tokens referenced by clients
```

## Prerequisites
- Node.js ≥ 20 (recommended) and npm ≥ 10.
- Access to OpenAI and/or Gemini API keys.
- Optional: Expo CLI (`npm i -g expo`) and Android Studio or a physical device for the native app.
- Optional: Netlify CLI / Render CLI if you prefer command-line deployments.

## Local Development

### 1. API proxy server
```bash
cd server
cp .env.example .env  # create if it does not exist
# Populate OPENAI_API_KEY and/or GEMINI_API_KEY plus optional settings
npm install
npm run start         # or npm run dev for watch mode
# Health check → http://127.0.0.1:8787/api/health
```

Verify connectivity:
```bash
curl http://127.0.0.1:8787/api/health
```

### 2. Web client
```bash
cd web
npm install
npm run dev           # http://127.0.0.1:5173
```
The Vite dev server proxies `/api/*` to `http://127.0.0.1:8787` by default. Update `vite.config.ts` if you change ports.

### 3. Expo native app (optional)
```bash
cd mobile
npm install
export SERVER_URL="http://<your-machine-ip>:8787"  # or edit app.config.ts
npm run android      # launches Metro + Android build
```
The app captures the Skia canvas and posts a base64 PNG to `${SERVER_URL}/api/analyze`. If you are using the provided Express proxy, update the fetch call in `CanvasScreen.tsx` to send the payload as `{ image: "data:image/png;base64,..." }` (the server expects the `image` field).

### 4. Static HTML preview (optional)
Open `index.html` directly in a modern browser or serve it with any static server:
```bash
npx serve .
```
The static build uses `window.APP_CONFIG.aiEndpoint` from `app.js`; set it if you want to forward requests to the proxy.

## Configuration

### Server environment variables (`server/.env`)
| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | Yes (if using OpenAI) | — | API key for OpenAI `chat/completions` (model `gpt-4o-mini`). |
| `GEMINI_API_KEY` | Yes (if using Gemini) | — | Google Generative Language API key. |
| `CORS_ORIGIN` | Recommended | `*` | Comma-separated list of allowed origins for browser requests. |
| `MAX_IMAGE_MB` | No | `8` | Maximum allowed image payload size (MB). |
| `RATE_LIMIT_WINDOW_MS` | No | `86400000` | Rate limit window in milliseconds (default 24h). |
| `RATE_LIMIT_MAX` | No | `10` | Max requests per IP per window. |
| `GEMINI_MODEL` | No | `gemini-1.5-flash-latest` | Override default Gemini model. |
| `GEMINI_API_VERSION` | No | `v1beta` | Gemini API version segment. |
| `GEMINI_API_BASE` | No | `https://generativelanguage.googleapis.com` | Override API base URL. |

### Client configuration
- **Web** – The provider selector and theme toggle live in `web/src/App.tsx`; selections persist in `localStorage`. The client hits `/api/analyze` relative to the current origin.
- **Expo** – Configure `extra.SERVER_URL` in `app.config.ts` or via environment variable (`SERVER_URL`) when running `expo start`.
- **Static demo** – Set `window.APP_CONFIG.aiEndpoint` in `index.html` (defaults to empty, meaning AI calls are disabled).

## Deployment

### Render (API)
`render.yaml` provisions the Express proxy as a Render Web Service:
1. Create a new Render service using this repository and select the `render.yaml` blueprint.
2. Provide `OPENAI_API_KEY`, `GEMINI_API_KEY`, and `CORS_ORIGIN` environment variables in the Render dashboard.
3. Expose `https://<service>.onrender.com/api/health` to confirm the deployment.

### Netlify (Web)
`netlify.toml` builds the Vite site and redirects `/api/*` to your hosted proxy:
1. Deploy the `web/` directory to Netlify (`netlify deploy --build` or via dashboard).
2. Set the `SERVER_URL` environment variable in Netlify to the deployed proxy origin (e.g. Render).
3. Netlify will run `npm ci && npm run build` and publish `web/dist`.
4. Validate `https://<site>.netlify.app` → `/api/health` (should proxy to your server).

You can adapt similar settings for Vercel, Cloudflare Pages, or any static hosting service by forwarding `/api/*` to the proxy.

### AWS EC2 (Secure .env Management)
For secure deployment on AWS EC2, use AWS Secrets Manager to manage environment variables:

**Setup Steps:**

1. **Create secret in AWS Secrets Manager:**
   ```bash
   # Upload secrets from local .env file
   ./scripts/upload-secret-to-aws.sh
   
   # Or create manually
   aws secretsmanager create-secret \
     --name Environment_Key \
     --secret-string '{"OPENAI_API_KEY":"your_key","GEMINI_API_KEY":"your_key"}'
   ```

2. **Attach IAM role to EC2 instance:**
   - IAM Console → Roles → Create Role → EC2
   - Attach policy: `SecretsManagerReadWrite`
   - Attach role to your EC2 instance

3. **Deploy to EC2:**
   ```bash
   # Automated deployment
   ./scripts/deploy-to-aws-ec2.sh
   
   # Or manual setup
   ./setup-ec2-secure.sh
   ```

**Available Scripts:**
- `setup-ec2-secure.sh` - Automated EC2 setup with secret loading
- `scripts/upload-secret-to-aws.sh` - Upload .env to AWS Secrets Manager
- `scripts/deploy-to-aws-ec2.sh` - Deploy application to EC2
- `server/scripts/load-secrets.js` - Load secrets from AWS Secrets Manager (runs automatically on EC2)

**Security:**
- Secrets encrypted at rest in AWS Secrets Manager
- No credentials stored on EC2 (uses IAM roles)
- Never commit `.env` files to Git

## Using the Canvas

### Tools & interactions
- Select a brush or shape, adjust size and color (custom color picker supported).
- Drag-and-drop or upload images to place them on the background layer; continue drawing on top.
- Zoom controls live in the top-right of the canvas; reset view restores fit-to-screen.
- Saved boards persist locally (IndexedDB/localStorage); export PNG snapshots anytime.
- Ask AI with an optional text prompt; responses stream into the side panel and can be copied.

### Keyboard shortcuts
- Draw: left click/drag (pressure enabled devices supported).
- Undo `Cmd/Ctrl + Z`; Redo `Cmd/Ctrl + Shift + Z`.
- Toggle theme via the header switch (persists automatically).
- Additional shortcuts (zoom, save) are surfaced in the UI tooltips.

## Security & Performance
- `helmet` for secure headers and disabled `x-powered-by`.
- `compression` for gzip/deflate responses.
- `express-rate-limit` with JSON error responses to deter abuse.
- Strict MIME/type and size validation for `data:image/*` payloads.
- Client honours `prefers-reduced-motion`, keeps DOM updates minimal, and leverages CSS variables for instant theming.

## Roadmap
- Layers panel (show/hide/lock/rename) with per-layer export.
- Rich text and shape library (arrows, polygons, sticky notes).
- OCR and math parsing for handwriting with LaTeX export.
- Advanced export formats (SVG, PDF) and transparent backgrounds.
- PWA install + offline board caching and background sync.
- Realtime collaboration (multi-cursor, presence, comments).
- Streaming AI responses with partial token display.
- Accessibility upgrades: keyboard-first workflow, high-contrast theme, screen-reader hints.

## Contributing
Issues and PRs are welcome. For large changes (new providers, architectural updates), please start a discussion to align on approach and maintain consistency across web, mobile, and server clients.

## License
MIT © Cognito

