import React, { useEffect, useState } from "react";
import { Download, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";

function PWAInstallPrompt({ compact = false, className = "" }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    const handleInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone;

    if (isStandalone) {
      setIsInstalled(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt(); // 🔥 triggers browser install popup

    try {
      await deferredPrompt.userChoice;
    } catch (err) {
      console.log("User dismissed install");
    }

    setDeferredPrompt(null);
    setIsVisible(false);
  };

  const handleClose = () => {
    setIsVisible(false);
  };

  if (isInstalled || !deferredPrompt || !isVisible) return null;

  if (compact) {
    return (
      <Button
        type="button"
        onClick={handleInstall}
        variant="outline"
        className={`rounded-full border-white/15 bg-white/5 px-4 text-white hover:bg-white/10 ${className}`}
      >
        <Download className="mr-2 h-4 w-4" />
        Install App
      </Button>
    );
  }

  return (
    <div
      className={`fixed bottom-5 right-5 z-[70] max-w-sm rounded-[28px] border border-white/10 bg-[#08111f]/90 p-4 text-white shadow-[0_28px_80px_rgba(2,8,23,0.45)] backdrop-blur-xl ${className}`}
    >
      {/* ❌ CLOSE BUTTON */}
      <button
        onClick={handleClose}
        className="absolute right-3 top-3 rounded-full p-1 hover:bg-white/10"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8b5cf6] via-[#ec4899] to-[#22d3ee]">
          <Smartphone className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-['Space_Grotesk'] text-lg font-semibold">
            Install ConnectNow
          </p>

          <p className="mt-1 text-sm leading-6 text-slate-300">
            Launch it like a real app with faster loading, offline support, and a better mobile experience.
          </p>

          <Button
            type="button"
            onClick={handleInstall}
            className="mt-4 rounded-full bg-gradient-to-r from-[#8b5cf6] via-[#ec4899] to-[#22d3ee] text-white"
          >
            <Download className="mr-2 h-4 w-4" />
            Install now
          </Button>
        </div>
      </div>
    </div>
  );
}

export default PWAInstallPrompt;