import React, { useEffect, useMemo, useRef, useState } from "react";
import { connect } from "react-redux";
import { LoaderCircle, Mic, Phone, Users, Video } from "lucide-react";
import { FaPhoneSlash } from "react-icons/fa";

import LocalVideoView from "../LocalVideoView/LocalVideoView";
import RemoteVideoView from "../RemoteVideoView/RemoteVideoView";
import CallRejectedDialog from "../CallRejectedDialog/CallRejectedDialog";
import IncomingCallDialog from "../IncomingCallDialog/IncomingCallDialog";
import CallingDialog from "../CallingDialog/CallingDialog";
import {
  callStates,
  setCallRejected,
  setLocalCameraEnabled,
  setLocalMicrophoneEnabled,
  setMessage,
} from "@store/actions/callActions";
import ConversationButtons from "../ConversationButtons/ConversationButtons";
import Messenger from "../Messenger/Messenger";
import { leaveCurrentGroupCall, acceptIncomingGroupCallRequest, rejectIncomingGroupCallRequest } from "@utils/webRTC/webRTCGroupCallHandler";

const createCallToneController = (pattern = "incoming") => {
  let audioContext = null;
  let oscillatorTimeouts = [];
  let repeatTimeout = null;
  let activeOscillators = [];
  let removeUnlockListeners = null;

  const ensureContext = async () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
      } catch (error) {
        console.error("Unable to resume audio context:", error);
      }
    }

    return audioContext;
  };

  const installUnlockListeners = async () => {
    const context = await ensureContext();
    if (!context || removeUnlockListeners) return;

    const unlock = async () => {
      try {
        await context.resume();
      } catch (error) {
        console.error("Unable to unlock audio context:", error);
      }
    };

    const events = ["pointerdown", "keydown", "touchstart"];
    events.forEach((eventName) =>
      window.addEventListener(eventName, unlock, { passive: true })
    );

    removeUnlockListeners = () => {
      events.forEach((eventName) =>
        window.removeEventListener(eventName, unlock)
      );
      removeUnlockListeners = null;
    };
  };

  const playPulse = async (frequency, delayMs, durationMs, gainValue = 0.08) => {
    const context = await ensureContext();
    if (!context) return;

    const timeout = window.setTimeout(() => {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      const startTime = context.currentTime;

      oscillator.type = pattern === "incoming" ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, startTime);
      gainNode.gain.setValueAtTime(0.0001, startTime);
      gainNode.gain.exponentialRampToValueAtTime(gainValue, startTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(
        0.0001,
        startTime + durationMs / 1000
      );

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + durationMs / 1000 + 0.05);
      activeOscillators.push(oscillator);

      oscillator.onended = () => {
        activeOscillators = activeOscillators.filter((node) => node !== oscillator);
        oscillator.disconnect();
        gainNode.disconnect();
      };
    }, delayMs);

    oscillatorTimeouts.push(timeout);
  };

  const schedulePattern = async () => {
    if (pattern === "outgoing") {
      await playPulse(425, 0, 320, 0.09);
      await playPulse(530, 480, 320, 0.08);
      repeatTimeout = window.setTimeout(schedulePattern, 2200);
      return;
    }

    await playPulse(760, 0, 260, 0.1);
    await playPulse(960, 320, 260, 0.09);
    await playPulse(1140, 700, 340, 0.08);
    repeatTimeout = window.setTimeout(schedulePattern, 2600);
  };

  return {
    async start() {
      await installUnlockListeners();
      this.stop();
      await schedulePattern();
    },
    stop() {
      oscillatorTimeouts.forEach((timeout) => window.clearTimeout(timeout));
      oscillatorTimeouts = [];

      if (repeatTimeout) {
        window.clearTimeout(repeatTimeout);
        repeatTimeout = null;
      }

      activeOscillators.forEach((oscillator) => {
        try {
          oscillator.stop();
        } catch {
          // Oscillator may already be stopped.
        }
      });
      activeOscillators = [];
    },
    destroy() {
      this.stop();
      removeUnlockListeners?.();
      if (audioContext) {
        audioContext.close().catch(() => {});
        audioContext = null;
      }
    },
  };
};

function ParticipantVideoTile({ participant, fallbackLabel, className = "" }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (!participant?.stream) return;

    const video = videoRef.current;
    const audio = audioRef.current;

    if (video) {
      video.srcObject = participant.stream;
      video.onloadedmetadata = () => {
        video.play().catch(() => {});
      };
    }

    if (audio) {
      audio.srcObject = participant.stream;
      audio.play().catch(() => {});
    }
  }, [participant?.stream]);

  const label = participant?.displayName || participant?.username || fallbackLabel || "Participant";

  return (
    <div
      className={`relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0d1526] shadow-[0_18px_42px_rgba(0,0,0,0.34)] ${className}`}
    >
      <audio ref={audioRef} autoPlay playsInline />
      {participant?.stream && participant?.stream.getVideoTracks?.().length ? (
        <video
          ref={videoRef}
          className="h-full min-h-[220px] w-full object-cover"
          autoPlay
          playsInline
        />
      ) : (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_35%),linear-gradient(180deg,#0c1222_0%,#111827_100%)] text-center text-white">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-3xl font-semibold">
            {label.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-lg font-semibold">{label}</p>
            <p className="mt-1 text-sm text-slate-400">
              {participant?.stream?.getAudioTracks?.().length ? "Audio connected" : "Waiting for media"}
            </p>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/75 to-transparent px-4 py-3 text-white">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-slate-300">{participant?.email || "Group member"}</p>
        </div>
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
      </div>
    </div>
  );
}

function GroupIncomingCallDialog({ incomingCall, isMobile }) {
  const isVideoCall = incomingCall?.callType === "video";

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(236,72,153,0.14),_transparent_28%),radial-gradient(circle_at_bottom,_rgba(34,211,238,0.12),_transparent_32%),linear-gradient(180deg,#040711_0%,#070d19_100%)] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.02),transparent_35%,rgba(255,255,255,0.02)_65%,transparent)] opacity-40" />
      <div className={`relative flex h-full flex-col ${isMobile ? "px-5 py-6" : "px-6 py-8 sm:px-10"}`}>
        <div className="flex items-center justify-between text-sm text-slate-300">
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5">
            Incoming group {isVideoCall ? "video" : "voice"} call
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-slate-400">
            {incomingCall?.invitedCount || 0} invited
          </span>
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center text-center">
          <div className="pointer-events-none absolute inset-[-18px] rounded-full bg-cyan-400/8 blur-xl" />
          <div className={`relative flex items-center justify-center rounded-full bg-white/10 ring-2 ring-white/10 ${isMobile ? "h-32 w-32" : "h-40 w-40 sm:h-48 sm:w-48"}`}>
            <Users className="h-16 w-16 text-cyan-200" />
          </div>

          <p className={`mt-10 font-['Space_Grotesk'] font-semibold tracking-[-0.03em] ${isMobile ? "text-3xl" : "text-4xl sm:text-5xl"}`}>
            {incomingCall?.groupName || "Group call"}
          </p>
          <p className="mt-3 text-base text-slate-400 sm:text-lg">
            {incomingCall?.callerUsername || "A group member"} started a {isVideoCall ? "video" : "voice"} call.
          </p>

          <div className="mt-6 flex items-center gap-3 text-sm text-slate-300">
            {isVideoCall ? <Video className="h-4 w-4 text-cyan-300" /> : <Mic className="h-4 w-4 text-cyan-300" />}
            <span>Join everyone already in the room and connect in realtime.</span>
          </div>

          <div className={`relative z-10 flex items-center ${isMobile ? "mt-12 gap-8" : "mt-16 gap-10"}`}>
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={rejectIncomingGroupCallRequest}
                className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white shadow-[0_18px_38px_rgba(244,63,94,0.28)] transition hover:scale-105"
                aria-label="Decline group call"
              >
                <FaPhoneSlash className="text-[30px]" />
              </button>
              <span className="text-sm text-slate-400">Decline</span>
            </div>

            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={acceptIncomingGroupCallRequest}
                className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_18px_38px_rgba(16,185,129,0.28)] transition hover:scale-105"
                aria-label="Join group call"
              >
                <Phone className="h-7 w-7" />
              </button>
              <span className="text-sm text-slate-400">Join</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupCallingDialog({ session, participantCount, isMobile }) {
  const isVideoCall = session?.callType === "video";

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(239,93,168,0.14),_transparent_28%),radial-gradient(circle_at_bottom,_rgba(34,211,238,0.12),_transparent_34%),linear-gradient(180deg,#040711_0%,#070d19_100%)] text-white">
      <div className={`relative flex h-full flex-col ${isMobile ? "px-5 py-6" : "px-6 py-8 sm:px-10"}`}>
        <div className="flex items-center justify-between text-sm text-slate-300">
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5">
            Outgoing group {isVideoCall ? "video" : "voice"} call
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-slate-300">
            <LoaderCircle className="h-4 w-4 animate-spin text-cyan-300" />
            Inviting participants...
          </span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className={`relative flex items-center justify-center rounded-full bg-white/10 ring-2 ring-white/10 ${isMobile ? "h-32 w-32" : "h-40 w-40 sm:h-48 sm:w-48"}`}>
            <Users className="h-16 w-16 text-cyan-200" />
          </div>
          <p className={`mt-10 font-['Space_Grotesk'] font-semibold tracking-[-0.03em] ${isMobile ? "text-3xl" : "text-4xl sm:text-5xl"}`}>
            {session?.groupName || "Group call"}
          </p>
          <p className="mt-3 text-base text-slate-400 sm:text-lg">
            Inviting {Math.max(participantCount - 1, 0)} participant{Math.max(participantCount - 1, 0) === 1 ? "" : "s"} into this call.
          </p>

          <div className={`flex flex-col items-center gap-3 ${isMobile ? "mt-12" : "mt-16"}`}>
            <button
              onClick={leaveCurrentGroupCall}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white shadow-[0_18px_38px_rgba(244,63,94,0.28)] transition hover:scale-105"
              aria-label="End group call"
            >
              <FaPhoneSlash className="text-[30px]" />
            </button>
            <span className="text-sm text-slate-400">End</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const DirectCall = (props) => {
  const {
    localStream,
    remoteStream,
    callState,
    callerUsername,
    callerImage,
    callingDialogVisible,
    callRejected,
    hideCallRejectedDialog,
    setDirectCallMessage,
    message,
    callType,
    groupCallIncoming,
    groupCallSession,
    groupCallConnecting,
    groupCallParticipants,
  } = props;
  const incomingToneRef = useRef(null);
  const outgoingToneRef = useRef(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);

  const isGroupCallIncoming = Boolean(groupCallIncoming);
  const isGroupCallActive = Boolean(groupCallSession);
  const isVideoCall = (groupCallSession?.callType || callType) === "video";
  const isRemoteConnected = Boolean(remoteStream);
  const otherParticipants = useMemo(
    () => (groupCallParticipants || []).filter((participant) => participant.stream || participant.userId !== groupCallSession?.hostId),
    [groupCallParticipants, groupCallSession?.hostId]
  );
  const remoteParticipants = useMemo(
    () => (groupCallParticipants || []).filter((participant) => participant.stream && participant.stream !== localStream),
    [groupCallParticipants, localStream]
  );
  const hasSingleRemoteParticipant = remoteParticipants.length === 1;

  useEffect(() => {
    incomingToneRef.current = createCallToneController("incoming");
    outgoingToneRef.current = createCallToneController("outgoing");

    return () => {
      incomingToneRef.current?.destroy();
      outgoingToneRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (callState === callStates.CALL_REQUESTED || isGroupCallIncoming) {
      incomingToneRef.current?.start();
    } else {
      incomingToneRef.current?.stop();
    }
  }, [callState, isGroupCallIncoming]);

  useEffect(() => {
    if ((callingDialogVisible && !isRemoteConnected) || groupCallConnecting) {
      outgoingToneRef.current?.start();
    } else {
      outgoingToneRef.current?.stop();
    }
  }, [callingDialogVisible, groupCallConnecting, isRemoteConnected]);

  if (
    callState !== callStates.CALL_IN_PROGRESS &&
    callState !== callStates.CALL_REQUESTED &&
    !callingDialogVisible &&
    !callRejected.rejected &&
    !isGroupCallIncoming &&
    !isGroupCallActive
  ) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] h-[100dvh] w-screen max-w-full overflow-hidden bg-[#040711]/98 backdrop-blur-xl">
      {callRejected.rejected && (
        <CallRejectedDialog
          reason={callRejected.reason}
          hideCallRejectedDialog={hideCallRejectedDialog}
        />
      )}

      {isGroupCallIncoming && <GroupIncomingCallDialog incomingCall={groupCallIncoming} isMobile={isMobile} />}

      {!isGroupCallIncoming && callState === callStates.CALL_REQUESTED && (
        <IncomingCallDialog
          callerUsername={callerUsername}
          callerImage={callerImage}
          callType={callType}
        />
      )}

      {groupCallConnecting && groupCallSession && (
        <GroupCallingDialog
          session={groupCallSession}
          participantCount={groupCallParticipants?.length || 1}
          isMobile={isMobile}
        />
      )}

      {!groupCallConnecting && callingDialogVisible && (
        <CallingDialog
          callType={callType}
          callerUsername={callerUsername}
          callerImage={callerImage}
        />
      )}

      {isGroupCallActive && !groupCallConnecting && (
        <div className="flex h-full w-full max-w-full flex-col overflow-hidden text-white">
          <div className={`flex items-center justify-between border-b border-white/10 ${isMobile ? "px-4 py-4" : "px-8 py-5"}`}>
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/10">
                <Users className="h-6 w-6 text-cyan-200" />
              </div>
              <div>
                <p className={`${isMobile ? "text-xl" : "text-2xl"} font-semibold`}>{groupCallSession.groupName || "Group call"}</p>
                <div className="mt-1 flex items-center gap-2 text-sm text-slate-400">
                  {isVideoCall ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                  <span>{groupCallParticipants?.length || 1} participant{(groupCallParticipants?.length || 1) === 1 ? "" : "s"} connected</span>
                </div>
              </div>
            </div>
            <div className="rounded-full bg-emerald-400/10 px-4 py-2 text-sm text-emerald-300">
              Live group call
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[1fr_360px]">
            <div className="relative min-h-0 overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.06),_transparent_35%),linear-gradient(180deg,#0b1020_0%,#090d18_100%)]">
              {isVideoCall ? (
                <div
                  className={`grid h-full gap-4 overflow-y-auto p-6 ${
                    hasSingleRemoteParticipant
                      ? "grid-cols-1"
                      : "auto-rows-fr sm:grid-cols-2 2xl:grid-cols-3"
                  }`}
                >
                  {remoteParticipants.length ? (
                    remoteParticipants.map((participant) => (
                      <ParticipantVideoTile
                        key={participant.userId}
                        participant={participant}
                        className={hasSingleRemoteParticipant ? "h-full min-h-full" : ""}
                      />
                    ))
                  ) : (
                    <div className="col-span-full flex h-full min-h-[220px] flex-col items-center justify-center rounded-[30px] border border-dashed border-white/10 text-center text-slate-300">
                      <Users className="mb-4 h-12 w-12 text-cyan-300" />
                      <p className="text-2xl font-semibold">Waiting for participants</p>
                      <p className="mt-2 text-sm text-slate-500">
                        Members will appear here as soon as they join the call.
                      </p>
                    </div>
                  )}
                  {localStream && <LocalVideoView localStream={localStream} />}
                </div>
              ) : (
                <div className="grid h-full auto-rows-fr gap-4 overflow-y-auto p-6 sm:grid-cols-2 2xl:grid-cols-3">
                  {(groupCallParticipants || []).map((participant) => (
                    <ParticipantVideoTile
                      key={participant.userId}
                      participant={participant}
                      fallbackLabel={participant.displayName}
                    />
                  ))}
                </div>
              )}

              <div className={`absolute left-1/2 -translate-x-1/2 ${isMobile ? "bottom-5" : "bottom-8"}`}>
                <ConversationButtons
                  {...props}
                  callType={groupCallSession.callType}
                  groupCall
                  onHangUp={leaveCurrentGroupCall}
                />
              </div>
            </div>

            <div className="hidden border-l border-white/10 bg-[#090e18] xl:flex xl:flex-col">
              <div className="border-b border-white/10 px-5 py-4">
                <p className="text-sm uppercase tracking-[0.28em] text-slate-400">
                  Participants
                </p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {(groupCallParticipants || []).map((participant) => (
                  <div
                    key={participant.userId}
                    className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={participant.image || "/avatar.png"}
                        alt={participant.displayName || participant.username}
                        className="h-11 w-11 rounded-full object-cover"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {participant.displayName || participant.username || "Participant"}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {participant.stream ? "Connected" : "Invited"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {!isGroupCallActive && callState === callStates.CALL_IN_PROGRESS && !callingDialogVisible && (
        <div className="flex h-full w-full max-w-full flex-col overflow-hidden">
          <div className={`flex items-center justify-between border-b border-white/10 text-white ${isMobile ? "px-4 py-4" : "px-8 py-5"}`}>
            <div className="flex items-center gap-4">
              <img
                src={callerImage || "/avatar.png"}
                alt="caller"
                className="h-14 w-14 rounded-full object-cover ring-1 ring-white/10"
              />
              <div>
                <p className={`${isMobile ? "text-xl" : "text-2xl"} font-semibold`}>{callerUsername || "In call"}</p>
                <div className="mt-1 flex items-center gap-2 text-sm text-slate-400">
                  {isVideoCall ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                  <span>
                    {isRemoteConnected
                      ? isVideoCall
                        ? "Video call in progress"
                        : "Audio call in progress"
                      : isVideoCall
                        ? "Connecting video call"
                        : "Connecting audio call"}
                  </span>
                </div>
              </div>
            </div>
            <div
              className={`rounded-full px-4 py-2 text-sm ${
                isRemoteConnected
                  ? "bg-emerald-400/10 text-emerald-300"
                  : "bg-white/5 text-slate-300"
              }`}
            >
              {isRemoteConnected ? "Connected" : "Ringing..."}
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[1fr_360px]">
            <div className={`relative flex min-h-0 overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.06),_transparent_35%),linear-gradient(180deg,#0b1020_0%,#090d18_100%)] ${isMobile ? "items-start justify-center px-4 pb-28 pt-8" : "items-center justify-center"}`}>
              {isVideoCall ? (
                <>
                  {remoteStream ? (
                    <RemoteVideoView remoteStream={remoteStream} />
                  ) : (
                    <div className={`flex flex-col items-center text-center text-slate-300 ${isMobile ? "mt-6" : ""}`}>
                      <img
                        src={callerImage || "/avatar.png"}
                        alt="caller avatar"
                        className={`mb-6 rounded-full object-cover ring-2 ring-white/10 ${isMobile ? "h-24 w-24" : "h-28 w-28"}`}
                      />
                      <p className={`${isMobile ? "text-2xl" : "text-3xl"} font-semibold`}>{callerUsername || "Connecting..."}</p>
                      <p className="mt-2 text-sm text-slate-500">Waiting for video feed...</p>
                    </div>
                  )}
                  {localStream && <LocalVideoView localStream={localStream} />}
                </>
              ) : (
                <div className={`flex flex-col items-center text-center text-white ${isMobile ? "mt-10" : ""}`}>
                  <div className={`relative ${isMobile ? "mb-6" : "mb-8"}`}>
                    <div className="absolute inset-0 animate-ping rounded-full bg-cyan-400/20" />
                    <img
                      src={callerImage || "/avatar.png"}
                      alt="caller avatar"
                      className={`relative rounded-full object-cover ring-2 ring-cyan-300/30 ${isMobile ? "h-28 w-28" : "h-36 w-36"}`}
                    />
                  </div>
                  <p className={`${isMobile ? "text-3xl" : "text-4xl"} font-semibold`}>{callerUsername || "Voice call"}</p>
                  <p className={`text-slate-400 ${isMobile ? "mt-2 max-w-[260px] text-sm leading-6" : "mt-3 text-base"}`}>
                    Stay connected with a distraction-free audio call.
                  </p>
                </div>
              )}

              <div className={`absolute left-1/2 z-10 -translate-x-1/2 ${isMobile ? "bottom-4" : "bottom-8"}`}>
                <ConversationButtons {...props} callType={callType} />
              </div>
            </div>

            <div className="hidden border-l border-white/10 bg-[#090e18] xl:flex xl:flex-col">
              <Messenger
                message={message}
                setDirectCallMessage={setDirectCallMessage}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function mapStoreStateToProps({ call }) {
  return {
    ...call,
  };
}

function mapDispatchToProps(dispatch) {
  return {
    hideCallRejectedDialog: (callRejectedDetails) =>
      dispatch(setCallRejected(callRejectedDetails)),
    setCameraEnabled: (enabled) => dispatch(setLocalCameraEnabled(enabled)),
    setMicrophoneEnabled: (enabled) =>
      dispatch(setLocalMicrophoneEnabled(enabled)),
    setDirectCallMessage: (received, content) =>
      dispatch(setMessage(received, content)),
  };
}

export default connect(mapStoreStateToProps, mapDispatchToProps)(DirectCall);
