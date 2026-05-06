import { useEffect, useMemo, useRef } from "react";

const positionClassMap = {
  "top-right": "right-4 top-4 sm:right-6 sm:top-6",
  "top-left": "left-4 top-4 sm:left-6 sm:top-6",
  "bottom-right": "bottom-24 right-4 sm:bottom-28 sm:right-6",
  "bottom-left": "bottom-24 left-4 sm:bottom-28 sm:left-6",
};

const LocalVideoPreview = ({
  localStream,
  localCameraEnabled,
  isVisible,
  position = "top-right",
  onCyclePosition,
}) => {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !localStream) return;

    video.srcObject = localStream;
    video.onloadedmetadata = () => {
      video.play().catch(() => {});
    };
  }, [localStream]);

  const initials = useMemo(() => "You", []);

  if (!isVisible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onCyclePosition}
      title="Move local preview"
      className={`absolute z-20 overflow-hidden rounded-[26px] border border-white/12 bg-[#08111f]/88 shadow-[0_24px_60px_rgba(2,8,23,0.52)] backdrop-blur-xl transition hover:scale-[1.02] ${positionClassMap[position] || positionClassMap["top-right"]} h-36 w-24 sm:h-44 sm:w-32`}
    >
      {localStream && localCameraEnabled && localStream.getVideoTracks().length ? (
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          autoPlay
          muted
          playsInline
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(103,232,249,0.12),_transparent_35%),linear-gradient(180deg,#09111f_0%,#0f172a_100%)] text-white">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-sm font-semibold">
            {initials}
          </div>
          <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-slate-300">
            Camera off
          </p>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-3 py-2 text-[11px] text-white">
        <span>You</span>
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
      </div>
    </button>
  );
};

export default LocalVideoPreview;
