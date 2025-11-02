import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Cognito Mobile",
  slug: "cognito-mobile",
  scheme: "cognito",
  version: "1.0.0",
  android: {
    package: "com.rohansonawane.cognito",
    versionCode: 1,
  },
  extra: {
    SERVER_URL: process.env.SERVER_URL ?? "https://your-service.onrender.com",
  },
};

export default config;


