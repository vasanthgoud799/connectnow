import { toast } from "sonner";

export const registerPWAServiceWorker = () => {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;

        worker.addEventListener("statechange", () => {
          if (
            worker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            toast.info("A new version of ConnectNow is ready. Refresh to update.");
          }
        });
      });
    } catch (error) {
      console.error("PWA service worker registration failed:", error);
    }
  });
};
