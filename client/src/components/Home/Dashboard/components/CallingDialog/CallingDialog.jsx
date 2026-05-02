import React from "react";
import { Phone, Video, LoaderCircle } from "lucide-react";
import { FaPhoneSlash } from "react-icons/fa";

import { hangUp } from "@utils/webRTC/webRTCHandler";

const CallingDialog = ({
  callType = "video",
  callerUsername,
  callerImage,
}) => {
  const isVideoCall = callType === "video";

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(239,93,168,0.14),_transparent_28%),radial-gradient(circle_at_bottom,_rgba(34,211,238,0.12),_transparent_34%),linear-gradient(180deg,#040711_0%,#070d19_100%)] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.02),transparent_35%,rgba(255,255,255,0.02)_65%,transparent)] opacity-40" />

      <div className="relative flex h-full flex-col px-6 py-8 sm:px-10">
        <div className="flex items-center justify-between text-sm text-slate-300">
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5">
            Outgoing {isVideoCall ? "video" : "voice"} call
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-slate-300">
            <LoaderCircle className="h-4 w-4 animate-spin text-cyan-300" />
            Ringing...
          </span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="relative">
            <div className="absolute inset-[-32px] rounded-full border border-pink-300/10" />
            <div className="absolute inset-[-18px] animate-pulse rounded-full bg-pink-400/8 blur-xl" />
            <img
              src={callerImage || "/avatar.png"}
              alt={callerUsername || "Calling"}
              className="relative h-40 w-40 rounded-full object-cover ring-2 ring-white/10 sm:h-48 sm:w-48"
            />
          </div>

          <p className="mt-10 font-['Space_Grotesk'] text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
            {callerUsername || "Calling..."}
          </p>
          <p className="mt-3 text-base text-slate-400 sm:text-lg">
            Waiting for the other person to answer your {isVideoCall ? "video" : "audio"} call.
          </p>

          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
            {isVideoCall ? <Video className="h-4 w-4 text-cyan-300" /> : <Phone className="h-4 w-4 text-cyan-300" />}
            <span>Ringing securely over realtime connection</span>
          </div>

          <div className="mt-16 flex flex-col items-center gap-3">
            <button
              onClick={hangUp}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white shadow-[0_18px_38px_rgba(244,63,94,0.28)] transition hover:scale-105"
              aria-label="End Call"
            >
              <FaPhoneSlash className="text-[30px]" />
            </button>
            <span className="text-sm text-slate-400">End</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CallingDialog;
