import React, { useEffect, useRef, useState } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import Auth from "./components/Auth"
import Home from "./components/Home";
import { Navigate, Route,Routes } from "react-router-dom";
import Profile from "./components/Profile";
import { useAppStore } from "./store";
import {
  apiClient,
  clearPersistedAppSession,
  persistAppSession,
} from "./lib/api-client";
import { CLERK_SYNC_ROUTE } from "./utils/constants";
import PWAInstallPrompt from "./components/PWAInstallPrompt";
import { ensureUserE2EEIdentity } from "./crypto/e2eeService";


const AppShellLoader = ({ message = "Preparing your conversations..." }) => (
  <div className="flex min-h-screen items-center justify-center bg-[#07111f] px-6 text-white">
    <div className="glass-panel rounded-[32px] px-8 py-7 text-center">
      <div className="mx-auto mb-4 h-14 w-14 animate-pulse rounded-2xl bg-gradient-to-br from-[#f97316] via-[#fb7185] to-[#38bdf8]" />
      <p className="font-['Space_Grotesk'] text-2xl font-semibold">
        Loading ConnectNow
      </p>
      <p className="mt-2 text-sm text-slate-300">{message}</p>
    </div>
  </div>
);

const PrivateRoute = ({ children, ready, isSignedIn, userInfo }) => {
  if (!ready) return <AppShellLoader />;
  return isSignedIn && userInfo ? children : <Navigate to="/auth" replace />;
}

const AuthRoute = ({ children, ready, isSignedIn, userInfo }) => {
  if (!ready) return <AppShellLoader message="Checking your sign-in status..." />;
  return isSignedIn && userInfo ? <Navigate to="/home" replace /> : children;
};


function App() {
  const { userInfo, setUserInfo } = useAppStore();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const authReady = isLoaded && !loading;
  const hasSyncedRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const retryTimeoutRef = useRef(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    if (!sessionStorage.getItem("connectnow-auth-page-opened-at")) {
      sessionStorage.setItem("connectnow-auth-page-opened-at", String(Date.now()));
    }
  }, []);

  useEffect(() => {
    const clearRetryTimeout = () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };

    const syncClerkUser = async ({ isRetry = false } = {}) => {
      if (syncInFlightRef.current) {
        console.info("Skipping duplicate Clerk sync request because one is already in flight.");
        return;
      }

      try {
        syncInFlightRef.current = true;
        const token = await getToken();
        if (!token) {
          hasSyncedRef.current = false;
          clearPersistedAppSession();
          setUserInfo(undefined);
          setLoading(false);
          return;
        }

        const syncResponse = await apiClient.post(
          CLERK_SYNC_ROUTE,
          {
            website: "",
            company: "",
          },
          {
            withCredentials: true,
            headers: {
              Authorization: `Bearer ${token}`,
              "X-Device-Label":
                [navigator.platform, navigator.userAgentData?.platform].filter(Boolean)[0] ||
                navigator.userAgent ||
                "Browser device",
              "X-Client-Render-Time": String(
                Math.max(
                  Date.now() -
                    Number(sessionStorage.getItem("connectnow-auth-page-opened-at") || Date.now()),
                  0
                )
              ),
            },
          }
        );

        if (syncResponse.status === 200 && syncResponse.data?.user?.id) {
          persistAppSession({
            token: syncResponse.data?.session?.token || "",
            csrfToken: syncResponse.data?.session?.csrfToken || "",
          });
          clearRetryTimeout();
          retryCountRef.current = 0;
          hasSyncedRef.current = true;
          setUserInfo(syncResponse.data.user);
        } else {
          hasSyncedRef.current = false;
          clearPersistedAppSession();
          setUserInfo(undefined);
        }
      } catch (error) {
        console.error("Error syncing Clerk user:", error);
        const status = Number(error?.response?.status || 0);
        const retryAfterHeader = Number(error?.response?.headers?.["retry-after"] || 0);
        const retryAfterBody = Number(error?.response?.data?.retryAfterSeconds || 0);
        const retryAfterSeconds = retryAfterHeader || retryAfterBody;
        const shouldRetry =
          status === 429 && retryCountRef.current < 1 && retryAfterSeconds > 0;

        if (shouldRetry) {
          retryCountRef.current += 1;
          hasSyncedRef.current = false;
          clearRetryTimeout();
          console.warn(
            `Clerk sync rate-limited. Retrying once in ${retryAfterSeconds} seconds.`
          );
          retryTimeoutRef.current = setTimeout(() => {
            syncClerkUser({ isRetry: true });
          }, retryAfterSeconds * 1000);
        } else {
          if (isRetry) {
            console.error("Clerk sync retry failed. No further retries will be attempted.");
          }
          clearPersistedAppSession();
          setUserInfo(undefined);
        }
      } finally {
        syncInFlightRef.current = false;
        setLoading(false);
      }
    };

    if (!isLoaded) return;

    if (!isSignedIn) {
      clearRetryTimeout();
      hasSyncedRef.current = false;
      syncInFlightRef.current = false;
      retryCountRef.current = 0;
      clearPersistedAppSession();
      setUserInfo(undefined);
      setLoading(false);
      return;
    }

    if (!user?.id) {
      return;
    }

    if (hasSyncedRef.current) {
      console.info("Skipping duplicate Clerk sync because the current Clerk user is already synced.");
      setLoading(false);
      return;
    }

    syncClerkUser();

    return () => {
      clearRetryTimeout();
    };
  }, [getToken, isLoaded, isSignedIn, setUserInfo, user?.id]);

  useEffect(() => {
    if (!authReady || !isSignedIn || !userInfo?.id) return;

    ensureUserE2EEIdentity(userInfo).catch((error) => {
      console.error("Error preparing E2EE identity:", error);
    });
  }, [authReady, isSignedIn, userInfo]);

  return (
    <>
      <Routes>
        <Route path="/auth" element={
          <AuthRoute ready={authReady} isSignedIn={isSignedIn} userInfo={userInfo}>
            <Auth />
          </AuthRoute>} 
        />
        <Route path="/home" element={
          <PrivateRoute ready={authReady} isSignedIn={isSignedIn} userInfo={userInfo}>
            <Home />
          </PrivateRoute>} 
        />
        <Route path="/profile" element={
          <PrivateRoute ready={authReady} isSignedIn={isSignedIn} userInfo={userInfo}>
            <Profile />
          </PrivateRoute>} 
        />
        <Route path="*" element={<Navigate to={isSignedIn ? "/home" : "/auth"} replace />} />
      </Routes>
      <PWAInstallPrompt />
    </>
  );
}

export default App;
