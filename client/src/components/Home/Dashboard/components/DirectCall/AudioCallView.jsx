import { Mic, MicOff, Phone, Video } from "lucide-react";

const AudioCallView = ({
  avatar,
  title,
  statusLine,
  helperText,
  durationText,
  callType,
  isConnected,
  localMicrophoneEnabled,
}) => (
  <div className="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden px-5 py-8 text-white sm:px-8">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_35%),radial-gradient(circle_at_bottom,_rgba(244,114,182,0.14),_transparent_35%),linear-gradient(180deg,#060a13_0%,#0b1220_100%)]" />
    <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:36px_36px]" />

    <div className="relative z-10 flex max-w-xl flex-col items-center text-center">
      <div className="relative mb-8">
        <div className="absolute inset-[-20px] animate-pulse rounded-full bg-cyan-400/10 blur-2xl" />
        <img
          src={avatar || "/avatar.png"}
          alt={title}
          className="relative h-28 w-28 rounded-full object-cover ring-2 ring-white/12 sm:h-36 sm:w-36"
        />
      </div>

      <p className="font-['Space_Grotesk'] text-3xl font-semibold tracking-[-0.03em] sm:text-5xl">
        {title}
      </p>
      <p className="mt-3 text-base text-slate-300 sm:text-lg">{statusLine}</p>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400 sm:text-base">
        {helperText}
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm text-slate-200">
          {callType === "video" ? (
            <Video className="h-4 w-4 text-cyan-300" />
          ) : (
            <Phone className="h-4 w-4 text-cyan-300" />
          )}
          {durationText}
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm text-slate-200">
          {localMicrophoneEnabled ? (
            <Mic className="h-4 w-4 text-emerald-300" />
          ) : (
            <MicOff className="h-4 w-4 text-rose-300" />
          )}
          {localMicrophoneEnabled ? "Microphone on" : "Microphone muted"}
        </span>
        {isConnected && (
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100">
            Audio connected
          </span>
        )}
      </div>
    </div>
  </div>
);

export default AudioCallView;
