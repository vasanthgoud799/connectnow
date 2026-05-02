import React, { useEffect } from "react";
import { PhoneOff } from "lucide-react";

const CallRejectedDialog = ({ reason, hideCallRejectedDialog }) => {
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      hideCallRejectedDialog({
        rejected: false,
        reason: "",
      });
    }, 4000);

    return () => clearTimeout(timeoutId);
  }, [hideCallRejectedDialog]);

  return (
    <div className="fixed left-1/2 top-8 z-[120] -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-full border border-rose-400/20 bg-[#120913]/95 px-5 py-3 text-sm text-rose-100 shadow-[0_18px_40px_rgba(15,23,42,0.45)] backdrop-blur-xl">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-500/15 text-rose-300">
          <PhoneOff className="h-4 w-4" />
        </span>
        <span>{reason}</span>
      </div>
    </div>
  );
};

export default CallRejectedDialog;
