import React, { useEffect, useState } from "react";
import { Phone, Video, Mic, Waves } from "lucide-react";
import { FaPhoneAlt } from "react-icons/fa";
import { RiCloseCircleFill } from "react-icons/ri";

import {
  acceptIncomingCallRequest,
  rejectIncomingCallRequest,
} from "@utils/webRTC/webRTCHandler";

const IncomingCallDialog = ({
  callerUsername,
  callerImage,
  callType = "video",
}) => {
  const [countdown, setCountdown] = useState(30);
  const isVideoCall = callType === "video";

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === 1) {
          clearInterval(timer);
          rejectIncomingCallRequest();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(236,72,153,0.14),_transparent_28%),radial-gradient(circle_at_bottom,_rgba(34,211,238,0.12),_transparent_32%),linear-gradient(180deg,#040711_0%,#070d19_100%)] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.02),transparent_35%,rgba(255,255,255,0.02)_65%,transparent)] opacity-40" />

      <div className="relative flex h-full flex-col px-6 py-8 sm:px-10">
        <div className="flex items-center justify-between text-sm text-slate-300">
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5">
            Incoming {isVideoCall ? "video" : "voice"} call
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-slate-400">
            Auto declines in {countdown}s
          </span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="relative">
            <div className="absolute inset-[-32px] rounded-full border border-cyan-300/10" />
            <div className="absolute inset-[-18px] animate-pulse rounded-full bg-cyan-400/8 blur-xl" />
            <img
              src={callerImage || "/avatar.png"}
              alt={callerUsername}
              className="relative h-40 w-40 rounded-full object-cover ring-2 ring-white/10 sm:h-48 sm:w-48"
            />
          </div>

          <p className="mt-10 font-['Space_Grotesk'] text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
            {callerUsername || "Unknown caller"}
          </p>
          <p className="mt-3 text-base text-slate-400 sm:text-lg">
            {isVideoCall ? "Wants to start a video call" : "Wants to start a voice call"}
          </p>

          <div className="mt-6 flex items-center gap-3 text-sm text-slate-300">
            {isVideoCall ? (
              <>
                <Video className="h-4 w-4 text-cyan-300" />
                <span>Camera and microphone will connect after you answer.</span>
              </>
            ) : (
              <>
                <Mic className="h-4 w-4 text-cyan-300" />
                <Waves className="h-4 w-4 text-pink-300" />
                <span>Clear voice audio over realtime connection.</span>
              </>
            )}
          </div>

          <div className="mt-16 flex items-center gap-10">
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={rejectIncomingCallRequest}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white shadow-[0_18px_38px_rgba(244,63,94,0.28)] transition hover:scale-105"
                aria-label="Decline call"
              >
                <RiCloseCircleFill className="text-[30px]" />
              </button>
              <span className="text-sm text-slate-400">Decline</span>
            </div>

            <div className="flex flex-col items-center gap-3">
              <button
                onClick={acceptIncomingCallRequest}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_18px_38px_rgba(16,185,129,0.28)] transition hover:scale-105"
                aria-label="Accept call"
              >
                <FaPhoneAlt className="text-2xl" />
              </button>
              <span className="text-sm text-slate-400">Answer</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallDialog;
