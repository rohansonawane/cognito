# Cognito Mobile (React Native / Expo)

Android app for the Cognito canvas + AI experience.

## Prereqs
- Node 18+
- Expo CLI: `npm i -g expo`
- Android Studio (SDK + emulator) or a physical Android device with Expo Go

## Setup
1. In project root `aicoderpad/mobile`, set your server URL (Render API):

```bash
export SERVER_URL=https://your-service.onrender.com
```

Alternatively, edit `app.config.ts` and set `extra.SERVER_URL`.

2. Install deps (already installed if you used the provided scripts):

```bash
npm install
```

## Run (Android)
- Start Metro and launch Android:

```bash
npm run android
```

This will build and open the app in an Android emulator or connected device.

## Features
- Freehand drawing (Skia) with smooth strokes
- Color palette and brush size controls (+ / -)
- Ask AI: captures canvas and POSTs base64 PNG to `${SERVER_URL}/api/analyze`

## Notes
- If Ask AI fails due to CORS or network, verify the server is reachable from device over the internet and that `SERVER_URL` is correct.
- For a signed APK/AAB, use EAS Build.


