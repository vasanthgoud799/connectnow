import axios from "axios";
import { HOST } from "@/utils/constants.js";

const getCookieValue = (name) => {
  if (typeof document === "undefined") return "";

  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1) || "";
};

export const apiClient = axios.create({
  baseURL: HOST,
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const method = String(config.method || "get").toUpperCase();
  config.headers = config.headers || {};
  config.headers["X-Client-Timezone"] = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrfToken = getCookieValue("csrf_token");
    if (csrfToken) {
      config.headers["X-CSRF-Token"] = decodeURIComponent(csrfToken);
    }

    config.headers["X-Request-Id"] =
      globalThis.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    config.headers["X-Request-Timestamp"] = String(Date.now());
  }

  return config;
});
