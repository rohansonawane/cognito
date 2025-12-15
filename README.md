# Cognito v1.1

<p align="center">
  <strong>Cognito</strong> is a fast AI whiteboard that turns sketches into structured explanations — including clean, KaTeX-rendered math.
</p>

<p align="center">
  <a href="https://cognito.shuruaat.in/"><img alt="Live Demo" src="https://img.shields.io/badge/Live-Demo-0ea5e9?style=for-the-badge" /></a>
  <a href="https://forms.gle/EunESTAMAMsato776"><img alt="Feedback" src="https://img.shields.io/badge/Feedback-Form-22c55e?style=for-the-badge" /></a>
</p>

<p align="center">
  <img alt="React" src="https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=0b1220" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=ffffff" />
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=ffffff" />
  <img alt="Express" src="https://img.shields.io/badge/Express-000000?logo=express&logoColor=ffffff" />
  <img alt="AWS" src="https://img.shields.io/badge/AWS-232F3E?logo=amazonaws&logoColor=FF9900" />
  <img alt="KaTeX" src="https://img.shields.io/badge/KaTeX-1f2937?logo=latex&logoColor=ffffff" />
</p>

---

## ✨ What is Cognito?

Cognito is a canvas-first app: **draw**, optionally **add a prompt**, and get AI analysis back as readable text with **properly formatted math**.

- **Live**: `https://cognito.shuruaat.in/`
- **Feedback**: `https://forms.gle/EunESTAMAMsato776`

---

## 🆕 What’s new in v1.1

- **Precision canvas**: new shape set (lines, polygons, stars), fills, rounded rectangles, advanced text boxes, and brush/eraser tuning.
- **Layout superpowers**: layers with lock/hide/reorder, grouping/ungrouping, align + distribute, flip, bring-to-front/send-to-back.
- **Smart AI assists**: auto-arrange, shape clean-up, and AI layout suggestions alongside the original whiteboard analysis.
- **Rich assets**: image upload with crop/resize/rotate/opacity controls; multiple images on a board.
- **Better outputs**: export to PNG/SVG/PDF (full canvas or selection) and save/load strokes.
- **Control & precision**: grid + rulers, zoom/pan + reset, history timeline with snapshots.

---

## ✅ Core features

- **AI canvas analysis**: summarization + interpretation of what’s on the board
- **Math-ready output**: KaTeX-rendered formulas and detailed steps for math questions
- **Whiteboard tools**: freehand, shapes, text, images, zoom/pan, grid/rulers
- **Provider switch**: choose between OpenAI and Gemini
- **Production security basics**: CSP + helmet + input validation + request timeouts

---

## 🧱 Repo structure

- `web/` — React + Vite frontend (canvas UI + AI response rendering)
- `server/` — Express API server (OpenAI + Google Gemini) + combined server entrypoint
- `scripts/` — deploy utilities (EC2 deployment + Secrets Manager helpers)

---

## ⚙️ Requirements

- Node.js **18+** (recommended: **20**)
- npm

---

## 🔐 Environment variables

Create `server/.env` (do **not** commit it — it’s already in `.gitignore`):

```env
# AI providers (add one or both)
OPENAI_API_KEY=your_openai_key
GEMINI_API_KEY=your_gemini_key

# Server
PORT=8787
NODE_ENV=development

# CORS (comma-separated)
CORS_ORIGIN=http://localhost:5173,http://localhost:8787

# Limits (defaults: 10/day)
RATE_LIMIT_MAX=10
RATE_LIMIT_WINDOW_MS=86400000

# Upload safety
MAX_IMAGE_MB=8

# Proxy support (recommended in production behind nginx/alb)
# TRUST_PROXY=loopback

# Gemini (optional)
GEMINI_MODEL=gemini-2.5-flash
GEMINI_API_VERSION=v1beta
GEMINI_API_BASE=https://generativelanguage.googleapis.com
```

---

## 🧪 Run locally (recommended)

### 1) Start backend

```bash
cd server
npm install
npm run dev
```

Backend: `http://localhost:8787`

### 2) Start frontend

```bash
cd web
npm install
npm run dev
```

Frontend: `http://localhost:5173`

---

## 🧩 Run “combined” (single process)

This serves the built frontend from the backend (best for EC2/PM2).

```bash
cd web
npm install
npm run build

cd ../server
npm install
node src/index-combined.js
```

---

## 🚀 Deploy to AWS EC2 (current setup)

This repo includes an EC2 deployment script that:
- uploads a tarball to EC2
- installs dependencies
- builds the frontend
- restarts the server with PM2

### 1) Deploy from your machine

```bash
EC2_KEY="/path/to/your.pem" bash scripts/deploy-to-aws-ec2.sh
```

### 2) (Optional) Store secrets in AWS Secrets Manager

You can upload `.env` values to Secrets Manager:

```bash
bash scripts/upload-secret-to-aws.sh Environment_Key us-east-2 server/.env
```

On the EC2 instance, `server/scripts/load-secrets.js` can pull the secret and write `server/.env`.

---

## 🛡️ Security notes (high level)

- **No secrets in git**: keep API keys in `server/.env` or AWS Secrets Manager
- **CSP/Helmet** enabled
- **Rate limiting** enabled (default: **10/day**)
- **Upload validation** for image data URLs and max size
- **Proxy support**: enable `TRUST_PROXY` when behind Nginx/ALB

---

## 🧰 Troubleshooting

- **Seeing old UI after deploy**:
  - hard refresh (`Cmd+Shift+R`)
  - ensure Nginx `root` points to the latest build output (e.g. `.../cognito/current/web/dist`)
- **OpenAI errors**:
  - `429 insufficient_quota` means your OpenAI key has no remaining quota/billing
  - switch to Gemini or update billing/key

---

## 🤝 Contributing

PRs and issues are welcome. If you’re integrating Cognito into another product (notebook/LMS/canvas tools), use the feedback form:
`https://forms.gle/EunESTAMAMsato776`
