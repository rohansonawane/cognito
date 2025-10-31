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


