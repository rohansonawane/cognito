import Constants from "expo-constants";

type Extra = {
  SERVER_URL?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

export const SERVER_URL: string = extra.SERVER_URL ?? "";


