import axios from "axios";
import { env } from "../lib/env";
import { getAccessToken } from "../lib/storage/token-storage";

export const httpClient = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 20_000,
});

httpClient.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
