<div align="center">

<img src="web/src/assets/Logo.png" alt="Cognito" height="56" />

Sketch. Solve. Describe. A modern, themeable canvas app with AI assistance (OpenAI/Gemini), built for web and mobile.

</div>

## ✨ Highlights

- Unified blue theme with light/dark modes
- Pressure‑smoothed brushes: Brush, Marker, Highlighter, Eraser
- Shapes overlay: Line, Rectangle, Ellipse with live preview
- Image upload and drag‑drop onto canvas (draw above BG layer)
- History: Undo/Redo, save boards locally, PNG export
- AI analysis: describe sketches or solve equations with optional prompt
- Responsive, keyboard shortcuts, animated micro‑interactions

## 🧭 Architecture

- `web/` – React + Vite (TypeScript), lucide-react icons, CSS variables
- `server/` – Express proxy to providers (OpenAI, Gemini)
- `native/` – Expo React Native sketch (RN‑SVG + ViewShot) [optional]

Canvas is rendered with layered `<canvas>` elements:

- BG layer (image/background color)
- Draw layer (strokes/shapes committed)
- Overlay (shape previews while dragging)

AI requests are proxied via the server to avoid exposing provider keys to the browser.

## 📁 Directory Structure

```
.
├─ web/
│  ├─ index.html
│  ├─ src/
│  │  ├─ App.tsx                 # UI + state
│  │  ├─ components/
│  │  │  ├─ CanvasBoard.tsx      # layered canvas + tools
│  │  │  ├─ ColorPicker.tsx
│  │  │  └─ SizeControl.tsx
│  │  ├─ ai/api.ts               # fetch /api/analyze
│  │  ├─ assets/Logo.png         # brand
│  │  └─ styles.css              # tokens + layout + animations
│  └─ vite.config.ts
├─ server/
│  └─ src/index.js               # Express proxy (OpenAI/Gemini)
└─ native/                       # Expo (optional)
```

## 🚀 Getting Started (Local Dev)

1) API server

```bash
cd server
cp .env.example .env   # if you created one; or edit server/.env
# Required: set OPENAI_API_KEY (and/or GEMINI_API_KEY)
npm i && npm run start
# → http://127.0.0.1:8787 (GET /api/health)
```

2) Web app

```bash
cd web
npm i && npm run dev
# → http://127.0.0.1:5173  (proxy /api → 8787)
```

3) (Optional) Native app

```bash
cd native
npm i && npm start
# Ensure the server is reachable from your device/emulator
```

## ⚙️ Configuration

`server/.env`

```bash
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
CORS_ORIGIN=http://127.0.0.1:5173
RATE_LIMIT_PER_MIN=120
MAX_IMAGE_MB=8
```

`web/src/App.tsx`

- Provider selector (OpenAI/Gemini) in header
- Theme toggle (dark/light) stored in `localStorage`

## 🔐 Security & Performance

Server middleware:

- `helmet` – secure headers
- `compression` – gzip/deflate
- `express-rate-limit` – per‑minute throttling on `/api/`
- CORS origin allow‑list via `CORS_ORIGIN`
- Data URL validation: type whitelist (png/jpg/jpeg/webp) and size guard (`MAX_IMAGE_MB`)

Client best practices:

- Keys stay on the server only (never in the client bundle)
- Animated effects respect `prefers-reduced-motion`
- Minimal DOM reflows, CSS variables for theme, Vite code-splitting

## 🖱️ Controls & Shortcuts

- Draw: left click/drag (pointer pressure when available)
- Shapes: select Line/Rect/Ellipse → drag to preview → release to commit
- Zoom: on‑canvas control (top‑right), Reset View
- Ask AI: bottom‑center prompt + button (shows animated state)
- Undo/Redo: Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z
- Save: header Tools → Save (local boards)

## 🎨 Theming

Theme tokens in `web/src/styles.css` under `:root` and `[data-theme="light"]`.

- Single blue palette (primary = accent) for consistency
- Toggle with the header theme switch (persists via localStorage)

## 🧪 Build & Preview

```bash
cd web && npm run build && npm run preview
# dist/ is generated; preview at http://127.0.0.1:5173
```

## 🧰 API Contract

`POST /api/analyze`

Request:

```json
{ "image": "data:image/png;base64,...", "provider": "openai" | "gemini", "prompt": "optional" }
```

Response:

```json
{ "ok": true, "message": "..." }
```

Errors return `{ ok:false, error:"..." }` with appropriate status codes.

## 🛣️ Roadmap

- Layers panel (show/hide/lock/rename)
- Free‑text labels with font/weight
- Export: JPG/SVG/PDF, transparent BG option
- PWA install, offline caching
- Streaming AI responses

## 🤝 Contributing

Issues and PRs are welcome. Please open a discussion for significant changes (architecture, provider integrations, new UI patterns).

## 📄 License

MIT © Cognito

---

## 🧰 Tech Stack

<div align="center">

<img alt="React" src="https://img.shields.io/badge/React-20232a?style=for-the-badge&logo=react&logoColor=61DAFB"/>
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178c6?style=for-the-badge&logo=typescript&logoColor=white"/>
<img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white"/>
<img alt="Express" src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white"/>
<img alt="Node.js" src="https://img.shields.io/badge/Node.js-3c873a?style=for-the-badge&logo=nodedotjs&logoColor=white"/>
<img alt="OpenAI" src="https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white"/>
<img alt="Gemini" src="https://img.shields.io/badge/Gemini-1A73E8?style=for-the-badge&logo=google&logoColor=white"/>
<img alt="CSS" src="https://img.shields.io/badge/CSS-1572B6?style=for-the-badge&logo=css3&logoColor=white"/>

</div>

## 📚 Detailed Usage

- Choose a brush or shape, set color and size. The canvas uses pressure smoothing and an overlay to preview shapes.
- Drop an image onto the canvas; it lands on the background layer so strokes remain editable above it.
- Use zoom controls on the canvas (top‑right). Reset view at any time.
- Enter an optional prompt and press Ask AI (bottom‑center). While analyzing, the response card and button animate.
- Saved boards are stored locally; download PNG exports for sharing.

## 🔭 Future Scope

- Realtime collaboration: multi‑cursor drawing, presence, cursors, and comments.
- Layers panel: reordering, visibility, lock, rename; per‑layer export.
- Rich shapes & text: arrows, polygons, bezier, sticky notes; text styling; emojis.
- OCR & math: handwriting recognition, LaTeX export, equation parsing.
- Advanced exports: SVG/PDF, transparent background, tiled poster export.
- PWA & Offline: installable app, offline boards, background sync.
- Streaming AI: partial tokens, inline citations/sources, step‑by‑step solutions.
- Accessibility: keyboard-only tool switching, high‑contrast mode, screen-reader hints.

### 🎓 LMS & Education Integrations

- LTI 1.3 integration to embed Cognito as an assignment/lesson inside LMS (Canvas, Moodle, Blackboard).
- Classroom mode: teacher view to broadcast a board; student submissions collected as boards.
- Auto‑grading assists: rubric + AI check for equations and diagrams.
- Account linking and roster sync, per‑class storage and permissions.
- Export to LMS gradebook and attach results as PDF/SVG.


AI Canvas Lab

Now available as:
- Static HTML (root files) — quick preview
- React web app (`web/`) — Vite + TS
- React Native app (`native/`) — Expo + react-native-svg
- Node proxy server (`server/`) — OpenAI + Gemini support

Run server (proxy for AI):
1) cd server
2) Create .env with `OPENAI_API_KEY=` and/or `GEMINI_API_KEY=`
3) npm i
4) npm run start (listens on http://127.0.0.1:8787)

Run React web app:
1) cd web && npm i
2) npm run dev (proxy /api to 127.0.0.1:8787)

Run React Native (Expo):
1) cd native && npm i && npm start
2) Ensure the server is reachable from device (adjust URL in code if needed)

API contract:
- POST /api/analyze { image: dataUrl, provider: "openai"|"gemini", prompt? }
- Response: { ok: boolean, message?: string, error?: string }

Design:
- Styling follows tokens in design.json (applied via CSS variables in root styles and used in RN styles).


