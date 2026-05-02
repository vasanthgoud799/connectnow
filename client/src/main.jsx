import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import { BrowserRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { store, persistor } from "./store/store"; // Ensure the correct path

import App from "./App"; // Main App component
import SocketProvider from "./context/SocketContext";
import { Toaster } from "sonner";
import { ThemeProvider } from "next-themes";
import "./index.css";
import { registerPWAServiceWorker } from "./utils/pwa";

registerPWAServiceWorker();
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const MissingClerkConfig = () => (
  <div className="flex min-h-screen items-center justify-center bg-[#07111f] px-6 text-white">
    <div className="glass-panel max-w-xl rounded-[32px] px-8 py-7 text-center">
      <p className="font-['Space_Grotesk'] text-3xl font-semibold">
        Clerk is not configured
      </p>
      <p className="mt-3 text-sm leading-7 text-slate-300">
        Add <code>VITE_CLERK_PUBLISHABLE_KEY</code> to the client environment to
        enable the new ConnectNow sign-in flow.
      </p>
    </div>
  </div>
);

ReactDOM.createRoot(document.getElementById("root")).render(
  clerkPublishableKey ? (
    <ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/auth">
      <Provider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <BrowserRouter
              future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            >
              <SocketProvider>
                <App />
                <Toaster closeButton />
              </SocketProvider>
            </BrowserRouter>
          </ThemeProvider>
        </PersistGate>
      </Provider>
    </ClerkProvider>
  ) : (
    <MissingClerkConfig />
  )
);
