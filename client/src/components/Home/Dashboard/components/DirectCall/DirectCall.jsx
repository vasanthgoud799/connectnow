import { useEffect, useMemo, useRef, useState } from "react";
import { connect } from "react-redux";
import { LoaderCircle, Mic, Phone, Users, Video } from "lucide-react";
import { FaPhoneSlash } from "react-icons/fa";

import CallRejectedDialog from "../CallRejectedDialog/CallRejectedDialog";
import IncomingCallDialog from "../IncomingCallDialog/IncomingCallDialog";
import {
  callStates,
  isDirectCallVisible,
  setCallRejected,
  setLocalCameraEnabled,
  setLocalMicrophoneEnabled,
  setMessage,
} from "@store/actions/callActions";
import Messenger from "../Messenger/Messenger";
import {
  getCurrentCallDiagnostics,
  hangUp,
  subscribeToCallDiagnostics,
} from "@utils/webRTC/webRTCHandler";
import {
  leaveCurrentGroupCall,
  acceptIncomingGroupCallRequest,
  rejectIncomingGroupCallRequest,
} from "@utils/webRTC/webRTCGroupCallHandler";
import AudioCallView from "./AudioCallView";
import VideoCallView from "./VideoCallView";
import RemoteAudioPlayer from "./RemoteAudioPlayer";
import CallControls from "./CallControls";
import CallStatusBadge from "./CallStatusBadge";
import ConnectionQualityIndicator from "./ConnectionQualityIndicator";
import { useCallTimer } from "./hooks/useCallTimer";
import { useResponsiveCallLayout } from "./hooks/useResponsiveCallLayout";
import { useConnectionQuality } from "./hooks/useConnectionQuality";
import { useCallMediaControls } from "./hooks/useCallMediaControls";
import { useSpeakingParticipants } from "./hooks/useSpeakingParticipants";
import GroupParticipantTile from "./GroupParticipantTile";

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
  const callScreenRef = useRef(null);
  const [callDiagnostics, setCallDiagnostics] = useState(() =>
    getCurrentCallDiagnostics()
  );
  const { isMobile, controlInsetClass } = useResponsiveCallLayout();

  const isGroupCallIncoming = Boolean(groupCallIncoming);
  const isGroupCallActive = Boolean(groupCallSession);
  const isVideoCall = (groupCallSession?.callType || callType) === "video";
  const isRemoteConnected =
    (remoteStream?.getTracks?.().length || 0) > 0 ||
    Boolean(callDiagnostics.remoteStreamReady) ||
    Boolean(callDiagnostics.remoteAudioTrackReady) ||
    Boolean(callDiagnostics.remoteVideoTrackReady);
  const isOutgoingCall = callState === callStates.CALL_CALLING;
  const isIncomingCall = callState === callStates.CALL_RINGING;
  const isDirectCallConnected = callState === callStates.CALL_CONNECTED;
  const isDirectCallScreenVisible = isDirectCallVisible(callState);
  const remoteParticipants = useMemo(
    () => (groupCallParticipants || []).filter((participant) => participant.stream && participant.stream !== localStream),
    [groupCallParticipants, localStream]
  );
  const hasSingleRemoteParticipant = remoteParticipants.length === 1;
  const isReconnecting = Boolean(callDiagnostics.reconnecting);
  const isRemoteAudioReady =
    Boolean(remoteStream?.getAudioTracks?.().length) ||
    Boolean(callDiagnostics.remoteAudioTrackReady);
  const quality = useConnectionQuality(callDiagnostics);
  const { formattedDuration } = useCallTimer(
    isDirectCallConnected && isRemoteConnected
  );
  const { formattedDuration: groupFormattedDuration } = useCallTimer(
    isGroupCallActive && !groupCallConnecting
  );
  const mediaControls = useCallMediaControls({
    containerRef: callScreenRef,
    isVideoCall,
  });
  const speakingIds = useSpeakingParticipants(groupCallParticipants || []);
  const localParticipant = useMemo(
    () =>
      (groupCallParticipants || []).find(
        (participant) => participant.stream === localStream
      ) || null,
    [groupCallParticipants, localStream]
  );
  const groupCallGridParticipants = useMemo(() => {
    const localEntry = localParticipant
      ? [{ ...localParticipant, isLocalParticipant: true }]
      : [];
    const remoteEntries = (groupCallParticipants || []).filter(
      (participant) => participant.userId !== localParticipant?.userId
    );

    return [...localEntry, ...remoteEntries];
  }, [groupCallParticipants, localParticipant]);

  const directCallPresentation = useMemo(() => {
    if (callDiagnostics.audioOnlyFallback) {
      return {
        badgeTone: "warning",
        badgeLabel: "Audio only",
        statusLine: "Camera unavailable. Continuing with voice.",
        helperText:
          "Your microphone is connected and the call can continue normally. Turn the camera back on later if it becomes available.",
      };
    }

    if (callDiagnostics.permissionError) {
      return {
        badgeTone: "warning",
        badgeLabel: "Permission needed",
        statusLine: callDiagnostics.permissionError,
        helperText:
          "Allow microphone access to hear the other person clearly. If camera access is blocked, the call can continue in audio mode.",
      };
    }

    if (isReconnecting) {
      return {
        badgeTone: "warning",
        badgeLabel: "Reconnecting",
        statusLine: "Trying to restore the call",
        helperText:
          "Your network changed or dropped briefly. We are attempting to reconnect without ending the call.",
      };
    }

    if (isOutgoingCall && !isRemoteConnected) {
      return {
        badgeTone: "info",
        badgeLabel: "Calling",
        statusLine: `Calling ${callerUsername || "your contact"}...`,
        helperText: isVideoCall
          ? "Your preview is ready. We will connect video and audio as soon as they answer."
          : "Your microphone is ready. The call will connect as soon as they answer.",
      };
    }

    if (isDirectCallConnected && isRemoteConnected) {
      if (callDiagnostics.connectionQuality === "poor") {
        return {
          badgeTone: "warning",
          badgeLabel: "Unstable",
          statusLine: "Connection is unstable",
          helperText:
            "Audio and video may pause for a moment while we recover the call. If needed, use Restart connection below.",
        };
      }

      return {
        badgeTone: "success",
        badgeLabel: "Connected",
        statusLine: isVideoCall
          ? "Video and audio are live"
          : "Voice call connected",
        helperText: callDiagnostics.audioOnlyFallback
          ? "Camera is unavailable on this device, so the call is continuing with clear audio only."
          : isVideoCall && callDiagnostics.waitingForVideo
            ? "Audio is connected. Waiting for the other person's camera feed."
            : "You can mute, hide your preview, or restart the connection anytime from the controls below.",
      };
    }

    return {
      badgeTone: "default",
      badgeLabel: "Connecting",
      statusLine: callDiagnostics.statusMessage || "Preparing the call...",
      helperText: "We are setting up your media and secure realtime connection.",
    };
  }, [
    callDiagnostics.audioOnlyFallback,
    callDiagnostics.connectionQuality,
    callDiagnostics.permissionError,
    callDiagnostics.statusMessage,
    callDiagnostics.waitingForVideo,
    callerUsername,
    isDirectCallConnected,
    isOutgoingCall,
    isReconnecting,
    isRemoteConnected,
    isVideoCall,
  ]);

  useEffect(() => {
    incomingToneRef.current = createCallToneController("incoming");
    outgoingToneRef.current = createCallToneController("outgoing");

    return () => {
      incomingToneRef.current?.destroy();
      outgoingToneRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToCallDiagnostics(setCallDiagnostics);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (isIncomingCall || isGroupCallIncoming) {
      incomingToneRef.current?.start();
    } else {
      incomingToneRef.current?.stop();
    }
  }, [isIncomingCall, isGroupCallIncoming]);

  useEffect(() => {
    if ((isOutgoingCall && !isRemoteConnected) || groupCallConnecting) {
      outgoingToneRef.current?.start();
    } else {
      outgoingToneRef.current?.stop();
    }
  }, [groupCallConnecting, isOutgoingCall, isRemoteConnected]);

  if (
    !isDirectCallScreenVisible &&
    !callRejected.rejected &&
    !isGroupCallIncoming &&
    !isGroupCallActive
  ) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] h-[var(--app-viewport-height,100dvh)] w-screen max-w-full overflow-hidden bg-[#040711]/98 backdrop-blur-xl">
      {callRejected.rejected && (
        <CallRejectedDialog
          reason={callRejected.reason}
          hideCallRejectedDialog={hideCallRejectedDialog}
        />
      )}

      {isGroupCallIncoming && <GroupIncomingCallDialog incomingCall={groupCallIncoming} isMobile={isMobile} />}

      {!isGroupCallIncoming && isIncomingCall && (
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

      {isGroupCallActive && !groupCallConnecting && (
        <div
          ref={callScreenRef}
          className="grid h-full w-full max-w-full min-h-0 grid-cols-1 overflow-hidden text-white xl:grid-cols-[minmax(0,1fr)_340px]"
        >
          <div className="relative min-h-0 overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.06),_transparent_35%),linear-gradient(180deg,#0b1020_0%,#090d18_100%)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-6 sm:py-6">
              <div className="pointer-events-auto flex items-center gap-3 rounded-[24px] border border-white/10 bg-black/30 px-3 py-3 text-white shadow-[0_24px_60px_rgba(2,8,23,0.28)] backdrop-blur-xl sm:px-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/10 sm:h-14 sm:w-14">
                  <Users className="h-5 w-5 text-cyan-200" />
                </div>
                <div>
                  <p className="font-['Space_Grotesk'] text-lg font-semibold tracking-[-0.03em] sm:text-2xl">
                    {groupCallSession.groupName || "Group call"}
                  </p>
                  <p className="mt-1 text-xs text-slate-300 sm:text-sm">
                    {callDiagnostics.connectionQuality === "poor"
                      ? "Connection is unstable"
                      : `${groupCallParticipants?.length || 1} participant${
                          (groupCallParticipants?.length || 1) === 1 ? "" : "s"
                        } connected`}
                  </p>
                </div>
              </div>

              <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
                <ConnectionQualityIndicator quality={quality} />
                <CallStatusBadge
                  label={isReconnecting ? "Trying to reconnect" : "Live group call"}
                  tone={isReconnecting ? "warning" : "success"}
                />
                <CallStatusBadge label={groupFormattedDuration} tone="default" />
              </div>
            </div>

            <div
              className={`grid h-full gap-4 overflow-y-auto px-4 pb-28 pt-28 sm:px-6 sm:pb-32 sm:pt-32 ${
                isVideoCall
                  ? hasSingleRemoteParticipant && localParticipant
                    ? "grid-cols-1"
                    : "grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3"
                  : "grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3"
              }`}
            >
              {groupCallGridParticipants.length ? (
                groupCallGridParticipants.map((participant) => (
                  <GroupParticipantTile
                    key={participant.userId}
                    participant={participant}
                    fallbackLabel={participant.displayName}
                    isLocalParticipant={Boolean(participant.isLocalParticipant)}
                    isActiveSpeaker={speakingIds.includes(String(participant.userId))}
                    className={hasSingleRemoteParticipant ? "h-full min-h-[280px]" : ""}
                  />
                ))
              ) : (
                <div className="col-span-full flex h-full min-h-[240px] flex-col items-center justify-center rounded-[30px] border border-dashed border-white/10 text-center text-slate-300">
                  <Users className="mb-4 h-12 w-12 text-cyan-300" />
                  <p className="text-2xl font-semibold">Waiting for participants</p>
                  <p className="mt-2 text-sm text-slate-500">
                    Members will appear here as soon as they join the call.
                  </p>
                </div>
              )}
            </div>

            <div
              className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 ${controlInsetClass}`}
            >
              <CallControls
                isVideoCall={isVideoCall}
                localMicrophoneEnabled={props.localMicrophoneEnabled}
                localCameraEnabled={props.localCameraEnabled}
                isLocalPreviewVisible={false}
                isFullscreen={mediaControls.isFullscreen}
                canSwitchCamera={mediaControls.canSwitchCamera}
                reconnecting={isReconnecting}
                busyControl={mediaControls.busyControl}
                showPreviewToggle={false}
                showRestartControl={false}
                onToggleMicrophone={mediaControls.handleToggleMicrophone}
                onToggleCamera={mediaControls.handleToggleCamera}
                onSwitchCamera={mediaControls.handleSwitchCamera}
                onToggleLocalPreview={() => {}}
                onToggleFullscreen={mediaControls.handleToggleFullscreen}
                onRestartConnection={() => {}}
                onHangUp={leaveCurrentGroupCall}
              />
            </div>
          </div>

          <div className="hidden min-h-0 border-l border-white/10 bg-[#090e18] xl:flex xl:flex-col">
            <div className="border-b border-white/10 px-5 py-4">
              <p className="text-sm uppercase tracking-[0.28em] text-slate-400">
                Participants
              </p>
              <p className="mt-2 text-sm text-slate-300">
                Active speaker tiles glow cyan. Use the large controls below to manage your mic and camera.
              </p>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {(groupCallParticipants || []).map((participant) => (
                <div
                  key={participant.userId}
                  className={`rounded-[22px] border px-4 py-3 ${
                    speakingIds.includes(String(participant.userId))
                      ? "border-cyan-300/40 bg-cyan-400/8"
                      : "border-white/10 bg-white/5"
                  }`}
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
      )}

      {!isGroupCallActive && isDirectCallScreenVisible && !isIncomingCall && (
        <div
          ref={callScreenRef}
          className="grid h-full w-full max-w-full min-h-0 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_340px]"
        >
          <div className="relative min-h-0 overflow-hidden">
            <RemoteAudioPlayer remoteStream={remoteStream} />

            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-6 sm:py-6">
              <div className="pointer-events-auto flex items-center gap-3 rounded-[24px] border border-white/10 bg-black/30 px-3 py-3 text-white shadow-[0_24px_60px_rgba(2,8,23,0.28)] backdrop-blur-xl sm:px-4">
                <img
                  src={callerImage || "/avatar.png"}
                  alt="caller"
                  className="h-12 w-12 rounded-full object-cover ring-1 ring-white/10 sm:h-14 sm:w-14"
                />
                <div>
                  <p className="font-['Space_Grotesk'] text-lg font-semibold tracking-[-0.03em] sm:text-2xl">
                    {callerUsername || "In call"}
                  </p>
                  <p className="mt-1 text-xs text-slate-300 sm:text-sm">
                    {directCallPresentation.statusLine}
                  </p>
                </div>
              </div>

              <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
                <ConnectionQualityIndicator quality={quality} />
                <CallStatusBadge
                  label={directCallPresentation.badgeLabel}
                  tone={directCallPresentation.badgeTone}
                />
                <CallStatusBadge
                  label={
                    isDirectCallConnected && isRemoteConnected
                      ? formattedDuration
                      : isOutgoingCall
                        ? "Ringing"
                        : "Connecting"
                  }
                  tone={isDirectCallConnected && isRemoteConnected ? "success" : "default"}
                />
              </div>
            </div>

            {isVideoCall ? (
              <VideoCallView
                remoteStream={remoteStream}
                localStream={localStream}
                localCameraEnabled={props.localCameraEnabled}
                localPreviewVisible={mediaControls.isLocalPreviewVisible}
                localPreviewPosition={mediaControls.previewPosition}
                avatar={callerImage}
                title={callerUsername || "Video call"}
                statusLine={directCallPresentation.helperText}
                waitingForVideo={callDiagnostics.waitingForVideo}
                reconnecting={isReconnecting}
              />
            ) : (
              <AudioCallView
                avatar={callerImage}
                title={callerUsername || "Voice call"}
                statusLine={directCallPresentation.statusLine}
                helperText={directCallPresentation.helperText}
                durationText={
                  isDirectCallConnected && isRemoteConnected
                    ? formattedDuration
                    : isOutgoingCall
                      ? "Ringing..."
                      : "Connecting..."
                }
                callType={callType}
                isConnected={isDirectCallConnected && isRemoteConnected && isRemoteAudioReady}
                localMicrophoneEnabled={props.localMicrophoneEnabled}
              />
            )}

            <div
              className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 ${controlInsetClass}`}
            >
              <CallControls
                isVideoCall={isVideoCall}
                localMicrophoneEnabled={props.localMicrophoneEnabled}
                localCameraEnabled={props.localCameraEnabled}
                isLocalPreviewVisible={mediaControls.isLocalPreviewVisible}
                isFullscreen={mediaControls.isFullscreen}
                canSwitchCamera={mediaControls.canSwitchCamera}
                reconnecting={isReconnecting}
                busyControl={mediaControls.busyControl}
                onToggleMicrophone={mediaControls.handleToggleMicrophone}
                onToggleCamera={mediaControls.handleToggleCamera}
                onSwitchCamera={mediaControls.handleSwitchCamera}
                onToggleLocalPreview={() =>
                  mediaControls.setIsLocalPreviewVisible(
                    !mediaControls.isLocalPreviewVisible
                  )
                }
                onToggleFullscreen={mediaControls.handleToggleFullscreen}
                onRestartConnection={mediaControls.handleRestartConnection}
                onHangUp={hangUp}
              />
            </div>
          </div>

          <div className="hidden min-h-0 border-l border-white/10 bg-[#090e18] xl:flex xl:flex-col">
            <div className="border-b border-white/10 px-5 py-4 text-white">
              <p className="text-sm font-medium uppercase tracking-[0.26em] text-slate-400">
                In-call notes
              </p>
              <p className="mt-2 text-sm text-slate-300">
                {callDiagnostics.permissionError ||
                  (callDiagnostics.audioOnlyFallback
                    ? "Camera is unavailable, so this call is continuing with audio only."
                    : "Send quick notes without leaving the call.")}
              </p>
            </div>
            <Messenger
              message={message}
              setDirectCallMessage={setDirectCallMessage}
            />
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

const ConnectedDirectCall = connect(
  mapStoreStateToProps,
  mapDispatchToProps
)(DirectCall);

export default ConnectedDirectCall;
