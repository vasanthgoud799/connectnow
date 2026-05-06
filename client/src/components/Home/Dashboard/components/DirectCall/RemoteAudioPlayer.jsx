import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";

const RemoteAudioPlayer = ({ remoteStream }) => {
  const audioRef = useRef(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  const attemptPlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !remoteStream) return;

    audio.srcObject = remoteStream;
    audio.muted = false;
    audio.volume = 1;

    try {
      await audio.play();
      setPlaybackBlocked(false);
    } catch (error) {
      setPlaybackBlocked(true);
      if (import.meta.env.DEV) {
        console.debug("[call] remote audio playback blocked", { name: error?.name });
      }
    }
  }, [remoteStream]);

  useEffect(() => {
    if (!remoteStream) {
      setPlaybackBlocked(false);
      return;
    }

    attemptPlayback();

    const remoteAudioTrack = remoteStream.getAudioTracks?.()[0];
    if (!remoteAudioTrack) {
      return undefined;
    }

    const handleUnmute = () => {
      attemptPlayback();
    };

    remoteAudioTrack.addEventListener("unmute", handleUnmute);

    return () => {
      remoteAudioTrack.removeEventListener("unmute", handleUnmute);
    };
  }, [attemptPlayback, remoteStream]);

  if (!remoteStream) {
    return null;
  }

  return (
    <>
      <audio ref={audioRef} autoPlay />
      {playbackBlocked && (
        <button
          type="button"
          onClick={attemptPlayback}
          className="absolute right-4 top-20 z-30 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-4 py-2 text-xs font-medium text-white shadow-[0_18px_40px_rgba(2,8,23,0.35)] backdrop-blur-lg sm:right-6"
        >
          <Volume2 className="h-4 w-4" />
          Tap to hear audio
        </button>
      )}
    </>
  );
};

export default RemoteAudioPlayer;
