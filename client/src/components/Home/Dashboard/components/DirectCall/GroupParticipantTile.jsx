import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, Volume2 } from "lucide-react";

const getParticipantMediaState = (participant) => {
  const audioTrack = participant?.stream?.getAudioTracks?.()[0];
  const videoTrack = participant?.stream?.getVideoTracks?.()[0];

  return {
    hasAudio: Boolean(
      audioTrack &&
        audioTrack.readyState === "live" &&
        audioTrack.enabled !== false &&
        !audioTrack.muted
    ),
    hasVideo: Boolean(
      videoTrack &&
        videoTrack.readyState === "live" &&
        videoTrack.enabled !== false &&
        !videoTrack.muted
    ),
  };
};

const GroupParticipantTile = ({
  participant,
  fallbackLabel,
  isActiveSpeaker = false,
  isLocalParticipant = false,
  className = "",
}) => {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const mediaSignature = useMemo(
    () =>
      participant?.stream
        ?.getTracks?.()
        .map((track) => `${track.kind}:${track.id}:${track.readyState}:${track.muted}`)
        .join("|") || "",
    [participant?.stream]
  );

  useEffect(() => {
    if (!participant?.stream) return undefined;

    const video = videoRef.current;
    const audio = audioRef.current;

    if (video) {
      video.srcObject = new MediaStream(participant.stream.getVideoTracks?.() || []);
      video.autoplay = true;
      video.playsInline = true;
      video.muted = isLocalParticipant;

      const playVideo = () => {
        video.play().catch(() => {});
      };
      video.onloadedmetadata = playVideo;
      video.oncanplay = playVideo;
      playVideo();
    }

    if (audio && !isLocalParticipant) {
      const audioTracks = participant.stream.getAudioTracks?.() || [];
      audioTracks.forEach((track) => {
        if (track.readyState === "live") {
          track.enabled = true;
        }
      });
      audio.srcObject = new MediaStream(audioTracks);
      audio.autoplay = true;
      audio.playsInline = true;
      audio.muted = false;
      audio.volume = 1;
      audio
        .play()
        .then(() => setPlaybackBlocked(false))
        .catch(() => {
          setPlaybackBlocked(true);
        });
    }

    return () => {
      if (video) {
        video.onloadedmetadata = null;
        video.oncanplay = null;
      }
    };
  }, [isLocalParticipant, mediaSignature, participant?.stream]);

  const label =
    participant?.displayName ||
    participant?.username ||
    fallbackLabel ||
    "Participant";
  const mediaState = useMemo(
    () => getParticipantMediaState(participant),
    [participant]
  );

  return (
    <div
      className={`relative overflow-hidden rounded-[28px] border bg-[#0d1526] shadow-[0_18px_42px_rgba(0,0,0,0.34)] ${
        isActiveSpeaker
          ? "border-cyan-300/60 ring-2 ring-cyan-300/25"
          : "border-white/10"
      } ${className}`}
    >
      {!isLocalParticipant && <audio ref={audioRef} autoPlay playsInline muted={false} />}
      {mediaState.hasVideo ? (
        <video
          ref={videoRef}
          className="h-full min-h-[220px] w-full object-cover"
          autoPlay
          playsInline
          muted={isLocalParticipant}
        />
      ) : (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_35%),linear-gradient(180deg,#0c1222_0%,#111827_100%)] px-6 text-center text-white">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-3xl font-semibold">
            {label.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-lg font-semibold">{label}</p>
            <p className="mt-1 text-sm text-slate-400">
              {mediaState.hasAudio ? "Audio connected" : "Waiting for media"}
            </p>
          </div>
        </div>
      )}

      {playbackBlocked && !isLocalParticipant && mediaState.hasAudio && (
        <button
          type="button"
          onClick={() => {
            const audio = audioRef.current;
            if (!audio) return;
            audio.play().then(() => setPlaybackBlocked(false)).catch(() => {});
          }}
          className="absolute right-3 top-3 z-20 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-2 text-[11px] font-medium text-white backdrop-blur-lg"
        >
          <Volume2 className="h-3.5 w-3.5" />
          Tap to enable audio
        </button>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {label}
            {isLocalParticipant ? " (You)" : ""}
          </p>
          <p className="truncate text-xs text-slate-300">
            {participant?.email || "Group member"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
              mediaState.hasAudio ? "bg-emerald-400/15 text-emerald-200" : "bg-rose-400/15 text-rose-200"
            }`}
            title={mediaState.hasAudio ? "Microphone connected" : "Microphone unavailable or muted"}
          >
            {mediaState.hasAudio ? (
              <Mic className="h-4 w-4" />
            ) : (
              <MicOff className="h-4 w-4" />
            )}
          </span>
          <span
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
              mediaState.hasVideo ? "bg-cyan-400/15 text-cyan-200" : "bg-slate-500/20 text-slate-200"
            }`}
            title={mediaState.hasVideo ? "Camera connected" : "Camera unavailable or off"}
          >
            {mediaState.hasVideo ? (
              <Video className="h-4 w-4" />
            ) : (
              <VideoOff className="h-4 w-4" />
            )}
          </span>
        </div>
      </div>
    </div>
  );
};

export default GroupParticipantTile;
