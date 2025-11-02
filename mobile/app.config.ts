import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Cognito Mobile",
  slug: "cognito-mobile",
  scheme: "cognito",
  extra: {
    SERVER_URL: process.env.SERVER_URL ?? "https://your-service.onrender.com",
  },
};

export default config;


