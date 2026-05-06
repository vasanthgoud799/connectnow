import { useEffect, useRef } from "react";
import { CameraOff, LoaderCircle } from "lucide-react";

import LocalVideoPreview from "./LocalVideoPreview";

const VideoCallView = ({
  remoteStream,
  localStream,
  localCameraEnabled,
  localPreviewVisible,
  localPreviewPosition,
  onCycleLocalPreviewPosition,
  avatar,
  title,
  statusLine,
  waitingForVideo,
  reconnecting,
}) => {
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    const video = remoteVideoRef.current;
    if (!video || !remoteStream) return;

    video.srcObject = remoteStream;
    video.onloadedmetadata = () => {
      video.play().catch(() => {});
    };
  }, [remoteStream]);

  const hasRemoteVideo = Boolean(remoteStream?.getVideoTracks?.().length);

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-[#040711]">
      {hasRemoteVideo ? (
        <video
          ref={remoteVideoRef}
          className="h-full w-full object-cover"
          autoPlay
          playsInline
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_35%),linear-gradient(180deg,#050913_0%,#0b1220_100%)] px-6 text-white">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-white/8 ring-1 ring-white/10 sm:h-36 sm:w-36">
              <img
                src={avatar || "/avatar.png"}
                alt={title}
                className="h-24 w-24 rounded-full object-cover sm:h-28 sm:w-28"
              />
            </div>
            <p className="font-['Space_Grotesk'] text-3xl font-semibold tracking-[-0.03em] sm:text-5xl">
              {title}
            </p>
            <p className="mt-3 text-base text-slate-300 sm:text-lg">{statusLine}</p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm text-slate-200">
              {reconnecting ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin text-cyan-300" />
                  Reconnecting video…
                </>
              ) : waitingForVideo ? (
                <>
                  <CameraOff className="h-4 w-4 text-cyan-300" />
                  Waiting for video…
                </>
              ) : (
                <>
                  <CameraOff className="h-4 w-4 text-cyan-300" />
                  Video unavailable, audio may still be connected
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/55 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent" />

      <LocalVideoPreview
        localStream={localStream}
        localCameraEnabled={localCameraEnabled}
        isVisible={localPreviewVisible}
        position={localPreviewPosition}
        onCyclePosition={onCycleLocalPreviewPosition}
      />
    </div>
  );
};

export default VideoCallView;
