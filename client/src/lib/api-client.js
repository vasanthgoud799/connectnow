import axios from "axios";
import { HOST } from "@/utils/constants.js";

export const APP_SESSION_STORAGE_KEY = "connectnow_session_token";
export const APP_CSRF_STORAGE_KEY = "connectnow_csrf_token";

const getCookieValue = (name) => {
  if (typeof document === "undefined") return "";

  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1) || "";
};

export const getStoredAppSessionToken = () =>
  typeof window === "undefined" ? "" : window.localStorage.getItem(APP_SESSION_STORAGE_KEY) || "";

export const getStoredCsrfToken = () =>
  typeof window === "undefined" ? "" : window.localStorage.getItem(APP_CSRF_STORAGE_KEY) || "";

export const persistAppSession = ({ token = "", csrfToken = "" } = {}) => {
  if (typeof window === "undefined") return;

  if (token) {
    window.localStorage.setItem(APP_SESSION_STORAGE_KEY, token);
  }

  if (csrfToken) {
    window.localStorage.setItem(APP_CSRF_STORAGE_KEY, csrfToken);
  }
};

export const clearPersistedAppSession = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(APP_SESSION_STORAGE_KEY);
  window.localStorage.removeItem(APP_CSRF_STORAGE_KEY);
};

let appSessionRefreshHandler = null;
let appSessionRefreshPromise = null;

export const registerAppSessionRefreshHandler = (handler) => {
  appSessionRefreshHandler = typeof handler === "function" ? handler : null;
};

export const apiClient = axios.create({
  baseURL: HOST,
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const method = String(config.method || "get").toUpperCase();
  config.headers = config.headers || {};
  config.headers["X-Client-Timezone"] = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const storedAppToken = getStoredAppSessionToken();
  const cookieCsrfToken = getCookieValue("csrf_token");
  const storedCsrfToken = getStoredCsrfToken();

  if (storedAppToken && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${storedAppToken}`;
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrfToken = cookieCsrfToken || storedCsrfToken;
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

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;
    const status = Number(error?.response?.status || 0);
    const requestUrl = String(originalRequest?.url || "");
    const isClerkSyncRequest = requestUrl.includes("/api/auth/clerk/sync");

    if (
      status !== 401 ||
      !originalRequest ||
      originalRequest.__appSessionRetry ||
      isClerkSyncRequest ||
      !appSessionRefreshHandler
    ) {
      return Promise.reject(error);
    }

    originalRequest.__appSessionRetry = true;

    try {
      if (!appSessionRefreshPromise) {
        appSessionRefreshPromise = Promise.resolve(appSessionRefreshHandler()).finally(() => {
          appSessionRefreshPromise = null;
        });
      }

      await appSessionRefreshPromise;

      if (originalRequest.headers) {
        delete originalRequest.headers.Authorization;
        delete originalRequest.headers["X-CSRF-Token"];
      }

      return apiClient(originalRequest);
    } catch (refreshError) {
      clearPersistedAppSession();
      return Promise.reject(refreshError || error);
    }
  }
);
