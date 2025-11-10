# Cognito Mobile (React Native / Expo)

Lightweight companion app for AI Canvas Lab, built with Expo and `@shopify/react-native-skia`. It mirrors the web drawing experience, captures the canvas as a PNG, and forwards it to the AI proxy.

## Table of Contents
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Run the App](#run-the-app)
  - [1. Start the proxy](#1-start-the-proxy)
  - [2. Launch Expo](#2-launch-expo)
- [Features](#features)
- [AI Integration](#ai-integration)
- [Troubleshooting](#troubleshooting)
- [Release & Distribution](#release--distribution)
- [Contributing](#contributing)

## Overview
The mobile client targets Android via Expo (works in Expo Go or a native build). It provides:
- A Skia-powered drawing surface tuned for touch input.
- Quick brush size/color adjustments, canvas clearing, and an `Ask AI` CTA.
- Tight integration with the Express proxy from the repository root so that API keys remain server-side.

## Prerequisites
- Node.js 18 or newer.
- Expo CLI: `npm i -g expo`.
- Android Studio with an emulator, or a physical Android device with Expo Go installed.
- Accessible API proxy URL (e.g. local tunnel, LAN IP, Render deployment).

## Environment Configuration
The app reads `SERVER_URL` from the Expo config:

```bash
export SERVER_URL="https://your-proxy.example.com"
```

Alternatively, edit `app.config.ts`:

```ts
export default {
  extra: {
    SERVER_URL: "https://your-proxy.example.com"
  }
};
```

`src/config.ts` exposes this value to the canvas screen. Make sure the URL is reachable from your device/emulator (e.g. use your machine's LAN IP rather than `localhost` when testing locally).

## Run the App

### 1. Start the proxy
Follow the root README to start the Express server:

```bash
cd ../server
npm run start
```

Confirm `http://<host>:8787/api/health` returns `{ "ok": true }`.

### 2. Launch Expo
```bash
cd mobile
npm install         # first run only
npm run android     # builds + opens in Expo Go / emulator
```

You can also run `npm start` for the Expo Dev Menu and pair by scanning the QR code.

## Features
- Pressure-friendly freehand drawing with Skia paths.
- Palette of curated colors plus +/- controls for brush size.
- `Clear` button to reset strokes without restarting the app.
- `Ask AI` button that snapshots the canvas to base64 PNG and posts to `${SERVER_URL}/api/analyze`.
- Loading indicator + error handling via native alerts.

## AI Integration
The current implementation posts:

```json
{ "imageBase64": "data:image/png;base64,..." }
```

The Express proxy in `server/` expects the field name `image`. Update the mobile client (within `CanvasScreen.tsx`) to send `{ image: "data:image/png;base64,..." }` or adjust the server to accept `imageBase64`. Remember to include an optional `provider` or `prompt` if you extend the UI.

## Troubleshooting
- **Blank AI response / network error** – Ensure `SERVER_URL` is set and reachable from the device (use LAN IP or hosted URL). Verify the proxy log for requests.
- **CORS or 403 errors** – Add your device origin/IP to `CORS_ORIGIN` in the proxy `.env`.
- **Expo cannot connect** – Restart Metro (`expo start -c`) and check that the emulator/device is on the same network.
- **Brush feels laggy** – Release builds perform better. Disable remote JS debugging when profiling drawing performance.
- **Image too large** – The proxy enforces `MAX_IMAGE_MB` (default 8 MB). Reduce strokes or tweak settings in `server/.env`.

## Release & Distribution
- Use [EAS Build](https://docs.expo.dev/build/introduction/) for signed APK/AAB:
  ```bash
  npm install -g eas-cli
  eas build -p android
  ```
- Configure release environments via `app.config.ts` (e.g. staging vs production `SERVER_URL`).
- For over-the-air updates, integrate Expo Updates or your preferred deployment workflow.

## Contributing
Pull requests that improve performance, add platform support (iOS), or align the payload with the shared proxy are welcome. Please coordinate changes with the main README so that documentation stays consistent across clients.

