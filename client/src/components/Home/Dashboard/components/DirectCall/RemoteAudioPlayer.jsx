import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Volume2 } from "lucide-react";

const RemoteAudioPlayer = ({ remoteStream }) => {
  const audioRef = useRef(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [audioUnavailable, setAudioUnavailable] = useState(false);
  const audioTrackSignature = useMemo(
    () =>
      remoteStream
        ?.getAudioTracks?.()
        .map((track) => `${track.id}:${track.readyState}:${track.muted}`)
        .join("|") || "",
    [remoteStream]
  );

  const attemptPlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !remoteStream) return;

    const audioTracks = remoteStream.getAudioTracks?.() || [];
    if (!audioTracks.length) {
      setAudioUnavailable(true);
      setPlaybackBlocked(false);
      return;
    }

    audioTracks.forEach((track) => {
      if (track.readyState === "live") {
        track.enabled = true;
      }
    });

    setAudioUnavailable(false);
    audio.srcObject = new MediaStream(audioTracks);
    audio.autoplay = true;
    audio.playsInline = true;
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
  }, [audioTrackSignature, remoteStream]);

  useEffect(() => {
    if (!remoteStream) {
      setPlaybackBlocked(false);
      setAudioUnavailable(false);
      return;
    }

    attemptPlayback();

    const remoteAudioTracks = remoteStream.getAudioTracks?.() || [];
    if (!remoteAudioTracks.length) {
      return undefined;
    }

    const handleTrackChange = () => {
      attemptPlayback();
    };

    remoteAudioTracks.forEach((track) => {
      track.addEventListener("mute", handleTrackChange);
      track.addEventListener("unmute", handleTrackChange);
      track.addEventListener("ended", handleTrackChange);
    });

    return () => {
      remoteAudioTracks.forEach((track) => {
        track.removeEventListener("mute", handleTrackChange);
        track.removeEventListener("unmute", handleTrackChange);
        track.removeEventListener("ended", handleTrackChange);
      });
    };
  }, [attemptPlayback, audioTrackSignature, remoteStream]);

  if (!remoteStream) {
    return null;
  }

  return (
    <>
      <audio ref={audioRef} autoPlay playsInline muted={false} />
      {audioUnavailable && (
        <div className="absolute right-4 top-20 z-30 rounded-full border border-white/10 bg-black/55 px-4 py-2 text-xs font-medium text-white shadow-[0_18px_40px_rgba(2,8,23,0.35)] backdrop-blur-lg sm:right-6">
          Waiting for audio
        </div>
      )}
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
