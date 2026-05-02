import React, { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import Auth from "./components/Auth"
import Home from "./components/Home";
import { Navigate, Route,Routes } from "react-router-dom";
import Profile from "./components/Profile";
import { useAppStore } from "./store";
import { apiClient } from "./lib/api-client";
import { CLERK_SYNC_ROUTE, GET_USER_INFO } from "./utils/constants";
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

  useEffect(() => {
    if (!sessionStorage.getItem("connectnow-auth-page-opened-at")) {
      sessionStorage.setItem("connectnow-auth-page-opened-at", String(Date.now()));
    }
  }, []);

  useEffect(() => {
    const syncClerkUser = async () => {
      try {
        const token = await getToken();
        if (!token) {
          setUserInfo(undefined);
          setLoading(false);
          return;
        }

        await apiClient.post(
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

        const sessionResponse = await apiClient.get(GET_USER_INFO, {
          withCredentials: true,
        });

        if (sessionResponse.status === 200 && sessionResponse.data?.id) {
          setUserInfo(sessionResponse.data);
        } else {
          setUserInfo(undefined);
        }
      } catch (error) {
        console.error("Error syncing Clerk user:", error);
        setUserInfo(undefined);
      } finally {
        setLoading(false);
      }
    };

    if (!isLoaded) return;

    if (!isSignedIn) {
      setUserInfo(undefined);
      setLoading(false);
      return;
    }

    syncClerkUser();
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
