# Cognito

An AI-powered canvas/whiteboard that lets you draw, add images, and get instant AI analysis (including **KaTeX-rendered math**).

## Repo structure

- `web/` — React + Vite frontend (UI + canvas + AI response renderer)
- `server/` — Express API server (OpenAI + Google Gemini)
- `mobile/`, `native/` — mobile/native experiments (optional)

## Requirements

- Node.js **18+**
- npm

## Environment variables

Create `server/.env`:

```env
OPENAI_API_KEY=your_openai_key
GEMINI_API_KEY=your_gemini_key

# optional
PORT=8787
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
MAX_IMAGE_MB=8
RATE_LIMIT_MAX=30
RATE_LIMIT_WINDOW_MS=86400000
GEMINI_MODEL=gemini-2.5-flash
GEMINI_API_VERSION=v1beta
GEMINI_API_BASE=https://generativelanguage.googleapis.com
```

## Run locally (recommended)

### 1) Start backend

```bash
cd server
npm install
npm run dev
```

Backend runs on `http://localhost:8787` (unless you changed `PORT`).

### 2) Start frontend

```bash
cd web
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

## Run “combined” (serve built frontend from backend)

```bash
npm install
npm run build
npm run start
```

This uses `server/src/index-combined.js` to serve `web/dist` and the API from one process.

## Notes

- AI responses are rendered as **plain text + KaTeX math** (the app extracts and renders LaTeX blocks).
- If you see CORS issues in dev, update `CORS_ORIGIN` in `server/.env`.


