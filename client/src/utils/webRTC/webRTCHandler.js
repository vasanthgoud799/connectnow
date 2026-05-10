import { store } from "../../store/store";
import {
  setLocalStream,
  setCallState,
  callStates,
  setCallType,
  setLocalCameraEnabled,
  setLocalMicrophoneEnabled,
  setCallingDialogVisible,
  setCallerUsername,
  setCallerImage,
  setCallRejected,
  setRemoteStream,
  setScreenSharingActive,
  resetCallDataState,
  setMessage,
} from "../../store/actions/callActions";
import { apiClient } from "../../lib/api-client";
import { CALLS_ICE_CONFIG_ROUTE, CALLS_STATUS_ROUTE } from "../constants.js";
import * as wss from "../wssConnection/wssConnection";

const preOfferAnswers = {
  CALL_ACCEPTED: "CALL_ACCEPTED",
  CALL_REJECTED: "CALL_REJECTED",
  CALL_NOT_AVAILABLE: "CALL_NOT_AVAILABLE",
  CALL_BUSY: "CALL_BUSY",
};

const isDevelopment = import.meta.env.DEV;

let rtcConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

let iceConfigurationPromise = null;

const createInitialDiagnostics = () => ({
  connectionState: "idle",
  iceConnectionState: "new",
  signalingState: "stable",
  connectionQuality: "unknown",
  statusMessage: "",
  permissionError: "",
  reconnecting: false,
  localAudioTrackReady: false,
  localVideoTrackReady: false,
  remoteAudioTrackReady: false,
  remoteVideoTrackReady: false,
  remoteStreamReady: false,
  waitingForVideo: false,
  audioOnlyFallback: false,
  microphoneBlocked: false,
  cameraUnavailable: false,
  canSwitchCamera: false,
  currentFacingMode: "user",
  currentRoundTripTimeMs: null,
  packetsLostRatio: null,
});

let callDiagnostics = createInitialDiagnostics();
const diagnosticsListeners = new Set();

const callContext = {
  sessionId: null,
  remoteUserId: null,
  remoteSocketId: null,
  callType: "video",
  peerConnection: null,
  dataChannel: null,
  pendingCandidates: [],
  screenSharingStream: null,
  remoteMediaStream: null,
  isCaller: false,
  callLogId: null,
  callConnectedAt: null,
  outgoingCallTimeoutId: null,
  answerWaitTimeoutId: null,
  iceRestartAttempts: 0,
  statsIntervalId: null,
  preferredFacingMode: "user",
};

const logCallDebug = (message, metadata = {}) => {
  if (!isDevelopment) return;
  console.debug(`[call] ${message}`, metadata);
};

const notifyDiagnosticsListeners = () => {
  diagnosticsListeners.forEach((listener) => {
    try {
      listener(callDiagnostics);
    } catch (error) {
      console.error("Error notifying call diagnostics listener:", error);
    }
  });
};

const updateCallDiagnostics = (patch) => {
  callDiagnostics = {
    ...callDiagnostics,
    ...patch,
  };
  notifyDiagnosticsListeners();
};

const resetCallDiagnostics = () => {
  callDiagnostics = createInitialDiagnostics();
  notifyDiagnosticsListeners();
};

export const subscribeToCallDiagnostics = (listener) => {
  if (typeof listener !== "function") {
    return () => {};
  }

  diagnosticsListeners.add(listener);
  listener(callDiagnostics);

  return () => {
    diagnosticsListeners.delete(listener);
  };
};

export const getCurrentCallDiagnostics = () => callDiagnostics;

const clearCallTimers = () => {
  if (callContext.outgoingCallTimeoutId) {
    clearTimeout(callContext.outgoingCallTimeoutId);
    callContext.outgoingCallTimeoutId = null;
  }

  if (callContext.answerWaitTimeoutId) {
    clearTimeout(callContext.answerWaitTimeoutId);
    callContext.answerWaitTimeoutId = null;
  }
};

const stopStatsCollection = () => {
  if (callContext.statsIntervalId) {
    clearInterval(callContext.statsIntervalId);
    callContext.statsIntervalId = null;
  }
};

const getCallState = () => store.getState().call;

const updateCallLogStatus = async (status) => {
  if (!callContext.callLogId) return;

  try {
    const endedAt = status === "ended" ? new Date() : null;
    const durationSeconds =
      status === "ended" && callContext.callConnectedAt
        ? Math.max(
            0,
            Math.round((endedAt.getTime() - callContext.callConnectedAt.getTime()) / 1000)
          )
        : undefined;

    await apiClient.patch(
      CALLS_STATUS_ROUTE,
      {
        callId: callContext.callLogId,
        status,
        endedAt,
        durationSeconds,
      },
      { withCredentials: true }
    );
  } catch (error) {
    console.error("Error updating call log:", error);
  }
};

const getFirstTrack = (stream, kind) =>
  stream?.getTracks?.().find((track) => track.kind === kind) || null;

const getFirstLiveTrack = (stream, kind) =>
  stream?.getTracks?.().find(
    (track) => track.kind === kind && track.readyState === "live"
  ) || null;

const hasLiveTrack = (stream, kind) => Boolean(getFirstLiveTrack(stream, kind));

const normalizeDisplayName = (value, fallback = "Unknown caller") => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }

  if (value && typeof value === "object") {
    const fromNames = [value.firstName, value.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    return fromNames || value.displayName || value.username || value.email || fallback;
  }

  return fallback;
};

const normalizeImage = (value) => {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    return value.image || value.imageUrl || "";
  }

  return "";
};

const formatMediaErrorMessage = (error, callType) => {
  if (!error) {
    return `Unable to access microphone${callType === "video" ? " or camera" : ""}.`;
  }

  switch (error.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return callType === "video"
        ? "Microphone or camera permission was blocked."
        : "Microphone permission was blocked.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return callType === "video"
        ? "No microphone or camera device was found."
        : "No microphone device was found.";
    case "NotReadableError":
      return "Your microphone or camera is busy in another app.";
    case "OverconstrainedError":
      return "Preferred media quality is unavailable on this device.";
    default:
      return `Unable to access microphone${callType === "video" ? " or camera" : ""}.`;
  }
};

const setCallRejectedState = (reason) => {
  store.dispatch(
    setCallRejected({
      rejected: true,
      reason,
    })
  );
};

const applyCallTypeToLocalStream = (stream, callType) => {
  if (!stream) return;

  stream.getAudioTracks().forEach((track) => {
    track.enabled = true;
  });

  stream.getVideoTracks().forEach((track) => {
    track.enabled = callType === "video";
  });
};

const stopTrack = (track) => {
  if (!track) return;
  try {
    track.stop();
  } catch {
    // Track may already be stopped.
  }
};

const stopStreamTracks = (stream) => {
  if (!stream) return;
  stream.getTracks().forEach(stopTrack);
};

const buildAudioConstraints = () => ({
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48000 },
  sampleSize: { ideal: 16 },
});

const buildVideoConstraints = (profile = "hd", facingMode = callContext.preferredFacingMode) => {
  if (profile === "sd") {
    return {
      width: { ideal: 640, max: 640 },
      height: { ideal: 360, max: 360 },
      frameRate: { ideal: 24, max: 24 },
      facingMode,
    };
  }

  return {
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
    frameRate: { ideal: 30, max: 30 },
    facingMode,
  };
};

const getMediaConstraints = (callType, profile = "hd") => ({
  video: callType === "video" ? buildVideoConstraints(profile) : false,
  audio: buildAudioConstraints(),
});

const refreshDeviceCapabilityDiagnostics = async () => {
  if (!navigator.mediaDevices?.enumerateDevices) {
    updateCallDiagnostics({ canSwitchCamera: false });
    return;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((device) => device.kind === "videoinput");
    updateCallDiagnostics({ canSwitchCamera: videoInputs.length > 1 });
  } catch (error) {
    logCallDebug("Unable to enumerate devices", { name: error?.name });
  }
};

const refreshLocalTrackDiagnostics = (stream, extras = {}) => {
  const localAudioTrack = getFirstTrack(stream, "audio");
  const localVideoTrack = getFirstTrack(stream, "video");

  if (!localAudioTrack) {
    logCallDebug("missing_local_audio_track");
  }
  if (callContext.callType === "video" && !localVideoTrack) {
    logCallDebug("missing_local_video_track");
  }

  updateCallDiagnostics({
    localAudioTrackReady:
      Boolean(localAudioTrack) &&
      localAudioTrack.readyState === "live" &&
      localAudioTrack.enabled,
    localVideoTrackReady:
      Boolean(localVideoTrack) &&
      localVideoTrack.readyState === "live" &&
      localVideoTrack.enabled,
    currentFacingMode: callContext.preferredFacingMode,
    ...extras,
  });
};

const refreshRemoteTrackDiagnostics = (stream, extras = {}) => {
  const remoteAudioTrack = getFirstTrack(stream, "audio");
  const remoteVideoTrack = getFirstTrack(stream, "video");

  updateCallDiagnostics({
    remoteStreamReady: Boolean(stream),
    remoteAudioTrackReady:
      Boolean(remoteAudioTrack) &&
      remoteAudioTrack.readyState === "live" &&
      remoteAudioTrack.enabled !== false,
    remoteVideoTrackReady:
      Boolean(remoteVideoTrack) &&
      remoteVideoTrack.readyState === "live" &&
      remoteVideoTrack.enabled !== false,
    waitingForVideo:
      callContext.callType === "video" &&
      !remoteVideoTrack &&
      Boolean(stream),
    ...extras,
  });
};

const observeTrackLifecycle = (track, source) => {
  if (!track) return;

  const label = `${source}_${track.kind}`;
  track.onmute = () => {
    logCallDebug(`${label}_mute`, { enabled: track.enabled });
    if (source === "remote") {
      refreshRemoteTrackDiagnostics(callContext.remoteMediaStream);
    } else {
      refreshLocalTrackDiagnostics(getCallState().localStream);
    }
  };

  track.onunmute = () => {
    logCallDebug(`${label}_unmute`, { enabled: track.enabled });
    if (source === "remote") {
      refreshRemoteTrackDiagnostics(callContext.remoteMediaStream);
    } else {
      refreshLocalTrackDiagnostics(getCallState().localStream);
    }
  };

  track.onended = () => {
    logCallDebug(`${label}_ended`);
    if (source === "remote") {
      refreshRemoteTrackDiagnostics(callContext.remoteMediaStream);
    } else {
      refreshLocalTrackDiagnostics(getCallState().localStream);
    }
  };
};

const ensureIceConfiguration = async () => {
  if (iceConfigurationPromise) {
    return iceConfigurationPromise;
  }

  iceConfigurationPromise = apiClient
    .get(CALLS_ICE_CONFIG_ROUTE, { withCredentials: true })
    .then((response) => {
      if (Array.isArray(response.data?.iceServers) && response.data.iceServers.length) {
        rtcConfiguration = { iceServers: response.data.iceServers };
      }

      return rtcConfiguration;
    })
    .catch((error) => {
      console.error("Error loading ICE configuration:", error);
      return rtcConfiguration;
    });

  return iceConfigurationPromise;
};

const closePeerConnection = () => {
  clearCallTimers();
  stopStatsCollection();

  if (callContext.peerConnection) {
    callContext.peerConnection.onicecandidate = null;
    callContext.peerConnection.ontrack = null;
    callContext.peerConnection.ondatachannel = null;
    callContext.peerConnection.onconnectionstatechange = null;
    callContext.peerConnection.oniceconnectionstatechange = null;
    callContext.peerConnection.onsignalingstatechange = null;
    callContext.peerConnection.close();
  }

  callContext.peerConnection = null;
  callContext.dataChannel = null;
  callContext.pendingCandidates = [];
  callContext.remoteMediaStream = null;
};

const createDataChannelHandlers = (dataChannel) => {
  if (!dataChannel) return;

  dataChannel.onopen = () => {
    logCallDebug("chat_data_channel_opened");
  };

  dataChannel.onmessage = (event) => {
    store.dispatch(setMessage(true, event.data));
  };
};

const flushPendingCandidates = async () => {
  if (!callContext.peerConnection || !callContext.pendingCandidates.length) {
    return;
  }

  const candidates = [...callContext.pendingCandidates];
  callContext.pendingCandidates = [];

  for (const candidate of candidates) {
    try {
      await callContext.peerConnection.addIceCandidate(candidate);
    } catch (error) {
      console.error("Error applying queued ICE candidate:", error);
    }
  }
};

const serializeSessionDescription = (description) => {
  if (!description) return null;

  return {
    type: description.type,
    sdp: description.sdp,
  };
};

const serializeIceCandidate = (candidate) => {
  if (!candidate) return null;

  if (typeof candidate.toJSON === "function") {
    return candidate.toJSON();
  }

  return {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    usernameFragment: candidate.usernameFragment,
  };
};

const deriveConnectionQuality = ({ iceState, connectionState, roundTripTimeMs, packetsLostRatio }) => {
  if (["failed", "disconnected"].includes(iceState) || connectionState === "failed") {
    return "poor";
  }

  if (roundTripTimeMs == null && packetsLostRatio == null) {
    return connectionState === "connected" ? "good" : "unknown";
  }

  if (roundTripTimeMs != null && roundTripTimeMs > 500) {
    return "poor";
  }

  if (packetsLostRatio != null && packetsLostRatio > 0.08) {
    return "poor";
  }

  if (
    (roundTripTimeMs != null && roundTripTimeMs > 220) ||
    (packetsLostRatio != null && packetsLostRatio > 0.03)
  ) {
    return "fair";
  }

  return "good";
};

const startConnectionStatsCollection = (peerConnection) => {
  stopStatsCollection();

  callContext.statsIntervalId = window.setInterval(async () => {
    if (!peerConnection || peerConnection.connectionState === "closed") {
      stopStatsCollection();
      return;
    }

    try {
      const stats = await peerConnection.getStats();
      let roundTripTimeMs = null;
      let totalPacketsLost = 0;
      let totalPacketsReceived = 0;

      stats.forEach((report) => {
        if (report.type === "candidate-pair" && report.state === "succeeded") {
          const currentRoundTripTime = report.currentRoundTripTime;
          if (typeof currentRoundTripTime === "number") {
            roundTripTimeMs = Math.round(currentRoundTripTime * 1000);
          }
        }

        if (report.type === "inbound-rtp" && !report.isRemote) {
          totalPacketsLost += report.packetsLost || 0;
          totalPacketsReceived += report.packetsReceived || 0;
        }
      });

      const packetsLostRatio =
        totalPacketsReceived > 0
          ? totalPacketsLost / (totalPacketsReceived + totalPacketsLost)
          : null;

      updateCallDiagnostics({
        currentRoundTripTimeMs: roundTripTimeMs,
        packetsLostRatio,
        connectionQuality: deriveConnectionQuality({
          iceState: peerConnection.iceConnectionState,
          connectionState: peerConnection.connectionState,
          roundTripTimeMs,
          packetsLostRatio,
        }),
      });

      const nextQuality = deriveConnectionQuality({
        iceState: peerConnection.iceConnectionState,
        connectionState: peerConnection.connectionState,
        roundTripTimeMs,
        packetsLostRatio,
      });

      if (nextQuality === "poor") {
        updateCallDiagnostics({
          statusMessage: "Connection is unstable",
        });
      }
    } catch (error) {
      logCallDebug("get_stats_failed", { name: error?.name });
    }
  }, 4000);
};

const renegotiateCurrentSession = async () => {
  if (
    !callContext.peerConnection ||
    !callContext.sessionId ||
    callContext.peerConnection.signalingState !== "stable"
  ) {
    return;
  }

  try {
    const offer = await callContext.peerConnection.createOffer();
    await callContext.peerConnection.setLocalDescription(offer);
    wss.sendWebRTCOffer({
      sessionId: callContext.sessionId,
      offer: serializeSessionDescription(offer),
    });
  } catch (error) {
    console.error("Error renegotiating active call:", error);
  }
};

const triggerIceRestart = async (peerConnection) => {
  if (!peerConnection || !callContext.sessionId || callContext.iceRestartAttempts >= 2) {
    return;
  }

  try {
    callContext.iceRestartAttempts += 1;
    updateCallDiagnostics({
      reconnecting: true,
      statusMessage: "Trying to reconnect...",
    });
    const restartedOffer = await peerConnection.createOffer({ iceRestart: true });
    await peerConnection.setLocalDescription(restartedOffer);
    wss.sendWebRTCOffer({
      sessionId: callContext.sessionId,
      offer: serializeSessionDescription(restartedOffer),
    });
  } catch (error) {
    console.error("Error restarting ICE:", error);
  }
};

const createPeerConnection = ({ createOutboundDataChannel = false } = {}) => {
  const { localStream } = getCallState();
  if (!localStream) return null;

  closePeerConnection();
  const peerConnection = new RTCPeerConnection(rtcConfiguration);
  callContext.remoteMediaStream = new MediaStream();

  localStream.getTracks().forEach((track) => {
    observeTrackLifecycle(track, "local");
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = ({ track, streams = [] }) => {
    if (!track) return;

    observeTrackLifecycle(track, "remote");

    const incomingStream = streams[0] || null;

    if (incomingStream instanceof MediaStream) {
      callContext.remoteMediaStream = incomingStream;
    } else if (
      !callContext.remoteMediaStream
        .getTracks()
        .some((existingTrack) => existingTrack.id === track.id)
    ) {
      callContext.remoteMediaStream.addTrack(track);
    }

    if (track.kind === "audio") {
      track.enabled = true;
      logCallDebug("remote_audio_track_received", { readyState: track.readyState });
    }

    if (track.kind === "video") {
      logCallDebug("remote_video_track_received", { readyState: track.readyState });
    }

    refreshRemoteTrackDiagnostics(callContext.remoteMediaStream, {
      statusMessage:
        track.kind === "video" ? "Video connected" : "Audio connected",
    });
    store.dispatch(
      setRemoteStream(new MediaStream(callContext.remoteMediaStream.getTracks()))
    );
  };

  peerConnection.ondatachannel = (event) => {
    callContext.dataChannel = event.channel;
    createDataChannelHandlers(callContext.dataChannel);
  };

  if (createOutboundDataChannel) {
    callContext.dataChannel = peerConnection.createDataChannel("chat");
    createDataChannelHandlers(callContext.dataChannel);
  }

  peerConnection.onicecandidate = (event) => {
    if (!event.candidate || !callContext.sessionId) return;

    wss.sendWebRTCCandidate({
      sessionId: callContext.sessionId,
      candidate: serializeIceCandidate(event.candidate),
    });
  };

  peerConnection.onsignalingstatechange = () => {
    updateCallDiagnostics({
      signalingState: peerConnection.signalingState,
    });
    logCallDebug("signaling_state_changed", {
      signalingState: peerConnection.signalingState,
    });
  };

  peerConnection.onconnectionstatechange = () => {
    const nextState = peerConnection.connectionState;
    logCallDebug("connection_state_changed", { connectionState: nextState });

    if (nextState === "connected") {
      clearCallTimers();
      callContext.iceRestartAttempts = 0;
      if (!callContext.callConnectedAt) {
        callContext.callConnectedAt = new Date();
      }
      updateCallDiagnostics({
        connectionState: nextState,
        reconnecting: false,
        statusMessage: "Connected",
        connectionQuality: "good",
      });
      store.dispatch(setCallState(callStates.CALL_CONNECTED));
      startConnectionStatsCollection(peerConnection);
      return;
    }

    if (nextState === "connecting") {
      updateCallDiagnostics({
        connectionState: nextState,
        reconnecting: true,
        statusMessage: "Connecting...",
      });
      return;
    }

    if (nextState === "disconnected" || nextState === "failed") {
      updateCallDiagnostics({
        connectionState: nextState,
        reconnecting: true,
        statusMessage: "Trying to reconnect...",
      });

      if (callContext.iceRestartAttempts >= 2 && nextState === "failed") {
        setCallRejectedState("Connection failed. Please try the call again.");
        resetCallDataAfterHangUp();
      }
    }
  };

  peerConnection.oniceconnectionstatechange = async () => {
    const nextIceState = peerConnection.iceConnectionState;
    logCallDebug("ice_connection_state_changed", { iceConnectionState: nextIceState });
    updateCallDiagnostics({
      iceConnectionState: nextIceState,
      reconnecting: ["checking", "disconnected"].includes(nextIceState),
    });

    if (["disconnected", "failed"].includes(nextIceState)) {
      await triggerIceRestart(peerConnection);
    }
  };

  callContext.peerConnection = peerConnection;
  startConnectionStatsCollection(peerConnection);
  return peerConnection;
};

const acquireLocalStream = async (callType) => {
  if (callType !== "video") {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: buildAudioConstraints(),
      video: false,
    });
    return {
      stream,
      audioOnlyFallback: false,
      cameraUnavailable: false,
      permissionError: "",
    };
  }

  let lastVideoError = null;

  for (const profile of ["hd", "sd"]) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        getMediaConstraints("video", profile)
      );
      return {
        stream,
        audioOnlyFallback: false,
        cameraUnavailable: false,
        permissionError: "",
      };
    } catch (error) {
      lastVideoError = error;
      logCallDebug("video_get_user_media_failed", {
        profile,
        name: error?.name,
      });
    }
  }

  const audioOnlyStream = await navigator.mediaDevices.getUserMedia({
    audio: buildAudioConstraints(),
    video: false,
  });

  return {
    stream: audioOnlyStream,
    audioOnlyFallback: true,
    cameraUnavailable: true,
    permissionError: formatMediaErrorMessage(lastVideoError, "video"),
  };
};

const replaceSenderTrack = async (kind, nextTrack, baseStream) => {
  const sender = callContext.peerConnection
    ?.getSenders()
    ?.find((currentSender) => currentSender.track?.kind === kind);

  if (sender) {
    await sender.replaceTrack(nextTrack || null);
    return false;
  }

  if (nextTrack && callContext.peerConnection) {
    callContext.peerConnection.addTrack(nextTrack, baseStream);
    return true;
  }

  return false;
};

const replaceLocalTrack = async (kind, nextTrack) => {
  const localStream = getCallState().localStream;
  if (!localStream || !nextTrack) return false;

  const existingTracks = localStream.getTracks().filter((track) => track.kind === kind);
  existingTracks.forEach((track) => {
    localStream.removeTrack(track);
    stopTrack(track);
  });

  localStream.addTrack(nextTrack);
  observeTrackLifecycle(nextTrack, "local");
  const addedNewSender = await replaceSenderTrack(kind, nextTrack, localStream);
  store.dispatch(setLocalStream(localStream));
  refreshLocalTrackDiagnostics(localStream);
  if (addedNewSender) {
    await renegotiateCurrentSession();
  }
  return true;
};

const ensureFreshVideoTrack = async () => {
  const localStream = getCallState().localStream;
  if (!localStream) return false;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: buildVideoConstraints("sd"),
      audio: false,
    });
    const nextVideoTrack = stream.getVideoTracks()[0];
    if (!nextVideoTrack) return false;

    await replaceLocalTrack("video", nextVideoTrack);
    updateCallDiagnostics({
      cameraUnavailable: false,
      audioOnlyFallback: false,
      permissionError: "",
    });
    store.dispatch(setLocalCameraEnabled(true));
    return true;
  } catch (error) {
    console.error("Error enabling camera:", error);
    updateCallDiagnostics({
      cameraUnavailable: true,
      permissionError: formatMediaErrorMessage(error, "video"),
    });
    return false;
  }
};

const ensureFreshAudioTrack = async () => {
  const localStream = getCallState().localStream;
  if (!localStream) return false;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: buildAudioConstraints(),
      video: false,
    });
    const nextAudioTrack = stream.getAudioTracks()[0];
    if (!nextAudioTrack) return false;

    await replaceLocalTrack("audio", nextAudioTrack);
    updateCallDiagnostics({
      microphoneBlocked: false,
      permissionError: "",
    });
    store.dispatch(setLocalMicrophoneEnabled(true));
    return true;
  } catch (error) {
    console.error("Error enabling microphone:", error);
    updateCallDiagnostics({
      microphoneBlocked: true,
      permissionError: formatMediaErrorMessage(error, "audio"),
    });
    return false;
  }
};

export const getAvailableCameraCount = async () => {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return 0;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === "videoinput").length;
  } catch (error) {
    logCallDebug("enumerate_devices_failed", { name: error?.name });
    return 0;
  }
};

export const getLocalStream = async (callType = "video", options = {}) => {
  try {
    await ensureIceConfiguration();
    await refreshDeviceCapabilityDiagnostics();
    callContext.callType = callType;

    const existingStream = getCallState().localStream;
    const canReuseStream =
      existingStream &&
      hasLiveTrack(existingStream, "audio") &&
      (callType === "audio" || hasLiveTrack(existingStream, "video"));

    if (canReuseStream) {
      applyCallTypeToLocalStream(existingStream, callType);
      store.dispatch(setCallType(callType));
      store.dispatch(
        setLocalCameraEnabled(callType === "video" && hasLiveTrack(existingStream, "video"))
      );
      store.dispatch(setLocalMicrophoneEnabled(true));
      refreshLocalTrackDiagnostics(existingStream, {
        audioOnlyFallback: callType === "video" && !hasLiveTrack(existingStream, "video"),
        cameraUnavailable: callType === "video" && !hasLiveTrack(existingStream, "video"),
        microphoneBlocked: !hasLiveTrack(existingStream, "audio"),
        permissionError: "",
      });

      if (!options.skipPeerConnection && !callContext.peerConnection) {
        createPeerConnection({
          createOutboundDataChannel: options.createOutboundDataChannel,
        });
      }

      return true;
    }

    if (existingStream) {
      stopStreamTracks(existingStream);
    }

    const mediaResult = await acquireLocalStream(callType);
    const stream = mediaResult.stream;
    logCallDebug("local_stream_ready", {
      audioTracks: stream.getAudioTracks().length,
      videoTracks: stream.getVideoTracks().length,
      audioOnlyFallback: mediaResult.audioOnlyFallback,
    });

    stream.getTracks().forEach((track) => observeTrackLifecycle(track, "local"));

    applyCallTypeToLocalStream(stream, callType);
    store.dispatch(setLocalStream(stream));
    store.dispatch(setCallType(callType));
    store.dispatch(setLocalCameraEnabled(stream.getVideoTracks().length > 0 && callType === "video"));
    store.dispatch(setLocalMicrophoneEnabled(stream.getAudioTracks().length > 0));
    refreshLocalTrackDiagnostics(stream, {
      audioOnlyFallback: mediaResult.audioOnlyFallback,
      cameraUnavailable: mediaResult.cameraUnavailable,
      microphoneBlocked: stream.getAudioTracks().length === 0,
      permissionError: mediaResult.permissionError || "",
      statusMessage: mediaResult.audioOnlyFallback
        ? "Camera unavailable, continuing with audio"
        : "Preparing local media...",
    });

    if (!options.skipPeerConnection) {
      createPeerConnection({
        createOutboundDataChannel: options.createOutboundDataChannel,
      });
    }
    return true;
  } catch (error) {
    console.error("Error accessing local stream:", error);
    updateCallDiagnostics({
      permissionError: formatMediaErrorMessage(error, callType),
      microphoneBlocked: ["NotAllowedError", "PermissionDeniedError"].includes(error?.name),
      cameraUnavailable: callType === "video",
    });
    return false;
  }
};

export const checkIfCallIsPossible = () => {
  const { callState: currentState, groupCallIncoming, groupCallSession } =
    getCallState();
  return (
    ![
      callStates.CALL_CALLING,
      callStates.CALL_RINGING,
      callStates.CALL_CONNECTED,
    ].includes(currentState) &&
    !groupCallIncoming &&
    !groupCallSession
  );
};

export const callToOtherUser = async (calleeDetails, callType = "video") => {
  if (!calleeDetails?.userId) {
    setCallRejectedState("Unable to resolve this contact for calling.");
    return;
  }

  callContext.callLogId = calleeDetails.callLogId || null;
  callContext.callConnectedAt = null;
  const isReady = await getLocalStream(callType, {
    createOutboundDataChannel: true,
  });

  if (!isReady) {
    void updateCallLogStatus("rejected");
    setCallRejectedState(
      formatMediaErrorMessage(null, callType)
    );
    store.dispatch(setCallState(callStates.CALL_IDLE));
    return;
  }

  callContext.remoteUserId = calleeDetails.userId;
  callContext.remoteSocketId = calleeDetails.socketId || null;
  callContext.callType = callType;
  callContext.sessionId = null;
  callContext.isCaller = true;

  store.dispatch(
    setCallerUsername(
      normalizeDisplayName(
        calleeDetails.displayName ||
          calleeDetails.username ||
          calleeDetails.email,
        "Calling..."
      )
    )
  );
  store.dispatch(setCallerImage(normalizeImage(calleeDetails)));
  store.dispatch(setCallType(callType));
  store.dispatch(
    setCallRejected({
      rejected: false,
      reason: "",
    })
  );
  store.dispatch(setCallingDialogVisible(false));
  store.dispatch(setRemoteStream(null));
  store.dispatch(setCallState(callStates.CALL_CALLING));
  callContext.iceRestartAttempts = 0;
  clearCallTimers();
  updateCallDiagnostics({
    connectionState: "connecting",
    statusMessage: "Calling...",
    reconnecting: false,
  });
  callContext.outgoingCallTimeoutId = setTimeout(() => {
    void updateCallLogStatus("missed");
    setCallRejectedState("Call timed out before the other user answered.");
    resetCallDataAfterHangUp();
  }, 30000);

  wss.sendPreOffer({
    callee: {
      userId: calleeDetails.userId,
    },
    caller: {
      username: store.getState().Home.username,
      displayName: store.getState().Home.username,
      imageUrl: store.getState().Home.imageUrl,
    },
    callType,
    callLogId: callContext.callLogId,
  });
};

export const handlePreOffer = (data) => {
  if (!data?.sessionId) return;

  if (checkIfCallIsPossible()) {
    callContext.sessionId = data.sessionId;
    callContext.remoteUserId = data.callerUserId || null;
    callContext.remoteSocketId = data.callerSocketId || null;
    callContext.callType = data.callType || "video";
    callContext.isCaller = false;
    callContext.callLogId = data.callLogId || null;
    callContext.callConnectedAt = null;

    store.dispatch(setCallerUsername(normalizeDisplayName(data.callerUsername)));
    store.dispatch(setCallerImage(normalizeImage(data.callerImage)));
    store.dispatch(setCallType(callContext.callType));
    store.dispatch(setLocalCameraEnabled(callContext.callType === "video"));
    store.dispatch(setRemoteStream(null));
    store.dispatch(setCallState(callStates.CALL_RINGING));
    updateCallDiagnostics({
      statusMessage: "Incoming call",
      connectionState: "new",
      reconnecting: false,
    });
    return;
  }

  wss.sendPreOfferAnswer({
    answer: preOfferAnswers.CALL_NOT_AVAILABLE,
    sessionId: data.sessionId,
  });
};

export const acceptIncomingCallRequest = async () => {
  const isReady = await getLocalStream(callContext.callType);

  if (!isReady) {
    wss.sendPreOfferAnswer({
      answer: preOfferAnswers.CALL_NOT_AVAILABLE,
      sessionId: callContext.sessionId,
    });
    resetCallData();
    return;
  }

  const localStream = getCallState().localStream;
  applyCallTypeToLocalStream(localStream, callContext.callType);

  wss.sendPreOfferAnswer({
    answer: preOfferAnswers.CALL_ACCEPTED,
    sessionId: callContext.sessionId,
  });

  void updateCallLogStatus("accepted");
  clearCallTimers();
  updateCallDiagnostics({
    statusMessage: "Connecting...",
    connectionState: "connecting",
  });
  store.dispatch(setCallState(callStates.CALL_CONNECTED));
};

export const rejectIncomingCallRequest = () => {
  wss.sendPreOfferAnswer({
    answer: preOfferAnswers.CALL_REJECTED,
    sessionId: callContext.sessionId,
  });
  void updateCallLogStatus("rejected");
  resetCallData();
};

const sendOffer = async () => {
  if (!callContext.peerConnection || !callContext.sessionId) return;

  const offer = await callContext.peerConnection.createOffer();
  await callContext.peerConnection.setLocalDescription(offer);

  wss.sendWebRTCOffer({
    sessionId: callContext.sessionId,
    offer: serializeSessionDescription(offer),
  });

  clearCallTimers();
  updateCallDiagnostics({
    statusMessage: "Connecting...",
    connectionState: "connecting",
  });
  callContext.answerWaitTimeoutId = setTimeout(() => {
    setCallRejectedState("Call signaling timed out. Please try again.");
    resetCallDataAfterHangUp();
  }, 20000);
};

export const handlePreOfferAnswer = async (data) => {
  store.dispatch(setCallingDialogVisible(false));

  if (data?.sessionId) {
    callContext.sessionId = data.sessionId;
  }

  if (data?.answererSocketId) {
    callContext.remoteSocketId = data.answererSocketId;
  }

  if (data.answer === preOfferAnswers.CALL_ACCEPTED) {
    void updateCallLogStatus("accepted");
    if (callContext.outgoingCallTimeoutId) {
      clearTimeout(callContext.outgoingCallTimeoutId);
      callContext.outgoingCallTimeoutId = null;
    }
    await sendOffer();
    return;
  }

  let rejectionReason = "Call rejected by the callee";
  if (data.answer === preOfferAnswers.CALL_BUSY) {
    rejectionReason = "This user is already in another call.";
  } else if (data.answer === preOfferAnswers.CALL_NOT_AVAILABLE) {
    rejectionReason = "Callee is not able to pick up the call right now.";
  } else if (data.answer === preOfferAnswers.CALL_REJECTED) {
    void updateCallLogStatus("rejected");
  }

  setCallRejectedState(rejectionReason);
  resetCallData();
};

export const handleOffer = async (data) => {
  if (!data?.offer || !callContext.sessionId || data.sessionId !== callContext.sessionId) {
    return;
  }

  const peerConnection =
    callContext.peerConnection ||
    createPeerConnection({ createOutboundDataChannel: false });
  if (!peerConnection) return;

  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  wss.sendWebRTCAnswer({
    sessionId: callContext.sessionId,
    answer: serializeSessionDescription(answer),
  });

  await flushPendingCandidates();
  if (!callContext.callConnectedAt) {
    callContext.callConnectedAt = new Date();
  }
  updateCallDiagnostics({
    statusMessage: "Connected",
    connectionState: "connected",
    reconnecting: false,
  });
  store.dispatch(setCallState(callStates.CALL_CONNECTED));
};

export const handleAnswer = async (data) => {
  if (!data?.answer || !callContext.peerConnection) return;
  if (data.sessionId && callContext.sessionId && data.sessionId !== callContext.sessionId) {
    return;
  }

  await callContext.peerConnection.setRemoteDescription(
    new RTCSessionDescription(data.answer)
  );
  await flushPendingCandidates();
  clearCallTimers();
  callContext.iceRestartAttempts = 0;
  if (!callContext.callConnectedAt) {
    callContext.callConnectedAt = new Date();
  }
  updateCallDiagnostics({
    statusMessage: "Connected",
    connectionState: "connected",
    reconnecting: false,
  });
  store.dispatch(setCallState(callStates.CALL_CONNECTED));
};

export const handleCandidate = async (data) => {
  if (!data?.candidate) return;
  if (data.sessionId && callContext.sessionId && data.sessionId !== callContext.sessionId) {
    return;
  }

  const iceCandidate = new RTCIceCandidate(data.candidate);

  if (
    !callContext.peerConnection ||
    !callContext.peerConnection.remoteDescription
  ) {
    callContext.pendingCandidates.push(iceCandidate);
    return;
  }

  try {
    await callContext.peerConnection.addIceCandidate(iceCandidate);
  } catch (error) {
    console.error("Error adding ICE candidate:", error);
  }
};

export const toggleMicrophoneTrack = async () => {
  const { localStream, localMicrophoneEnabled } = getCallState();
  if (!localStream) return false;

  const audioTrack = getFirstTrack(localStream, "audio");

  if (!audioTrack || audioTrack.readyState !== "live") {
    return ensureFreshAudioTrack();
  }

  const nextEnabled = !localMicrophoneEnabled;
  audioTrack.enabled = nextEnabled;
  store.dispatch(setLocalMicrophoneEnabled(nextEnabled));
  refreshLocalTrackDiagnostics(localStream, {
    statusMessage: nextEnabled ? "Microphone on" : "Microphone muted",
  });
  return nextEnabled;
};

export const toggleCameraTrack = async () => {
  const { localStream, localCameraEnabled } = getCallState();
  if (!localStream) return false;

  const videoTrack = getFirstTrack(localStream, "video");

  if (!videoTrack || videoTrack.readyState !== "live") {
    return ensureFreshVideoTrack();
  }

  const nextEnabled = !localCameraEnabled;
  videoTrack.enabled = nextEnabled;
  store.dispatch(setLocalCameraEnabled(nextEnabled));
  refreshLocalTrackDiagnostics(localStream, {
    statusMessage: nextEnabled ? "Camera on" : "Camera off",
  });
  return nextEnabled;
};

export const switchCameraFacingMode = async () => {
  const { localStream } = getCallState();
  if (!localStream || callContext.callType !== "video") {
    return false;
  }

  callContext.preferredFacingMode =
    callContext.preferredFacingMode === "user" ? "environment" : "user";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: buildVideoConstraints("sd", callContext.preferredFacingMode),
    });
    const nextVideoTrack = stream.getVideoTracks()[0];
    if (!nextVideoTrack) return false;

    await replaceLocalTrack("video", nextVideoTrack);
    store.dispatch(setLocalCameraEnabled(true));
    refreshLocalTrackDiagnostics(localStream, {
      statusMessage:
        callContext.preferredFacingMode === "environment"
          ? "Rear camera selected"
          : "Front camera selected",
    });
    return true;
  } catch (error) {
    console.error("Error switching camera:", error);
    callContext.preferredFacingMode =
      callContext.preferredFacingMode === "user" ? "environment" : "user";
    return false;
  }
};

export const restartCurrentCallConnection = async () => {
  if (!callContext.peerConnection) return;
  await triggerIceRestart(callContext.peerConnection);
};

export const switchForScreenSharingStream = async () => {
  if (!getCallState().screenSharingActive) {
    try {
      callContext.screenSharingStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });

      store.dispatch(setScreenSharingActive(true));
      const senders = callContext.peerConnection?.getSenders() || [];
      const sender = senders.find(
        (currentSender) =>
          currentSender.track?.kind ===
          callContext.screenSharingStream.getVideoTracks()[0]?.kind
      );

      sender?.replaceTrack(callContext.screenSharingStream.getVideoTracks()[0]);
    } catch (error) {
      console.error("Error starting screen share:", error);
    }
    return;
  }

  const { localStream } = getCallState();
  const senders = callContext.peerConnection?.getSenders() || [];
  const sender = senders.find(
    (currentSender) => currentSender.track?.kind === localStream?.getVideoTracks?.()[0]?.kind
  );

  sender?.replaceTrack(localStream.getVideoTracks()[0]);
  store.dispatch(setScreenSharingActive(false));
  stopStreamTracks(callContext.screenSharingStream);
  callContext.screenSharingStream = null;
};

export const handleUserHangedUp = (data = {}) => {
  if (data.sessionId && callContext.sessionId && data.sessionId !== callContext.sessionId) {
    return;
  }

  void updateCallLogStatus("ended");
  resetCallDataAfterHangUp();
};

export const hangUp = () => {
  wss.sendUserHangedUp({
    sessionId: callContext.sessionId,
  });

  void updateCallLogStatus("ended");
  resetCallDataAfterHangUp();
};

const resetCallDataAfterHangUp = () => {
  const { localStream, screenSharingActive } = getCallState();

  closePeerConnection();
  resetCallData();

  stopStreamTracks(localStream);

  if (screenSharingActive) {
    stopStreamTracks(callContext.screenSharingStream);
    callContext.screenSharingStream = null;
  }

  store.dispatch(resetCallDataState());
};

export const resetCallData = () => {
  clearCallTimers();
  stopStatsCollection();
  callContext.sessionId = null;
  callContext.remoteUserId = null;
  callContext.remoteSocketId = null;
  callContext.callType = "video";
  callContext.pendingCandidates = [];
  callContext.isCaller = false;
  callContext.callLogId = null;
  callContext.callConnectedAt = null;
  callContext.iceRestartAttempts = 0;
  callContext.remoteMediaStream = null;
  callContext.preferredFacingMode = "user";
  resetCallDiagnostics();

  store.dispatch(setCallState(callStates.CALL_IDLE));
  store.dispatch(setCallType("video"));
  store.dispatch(setCallingDialogVisible(false));
  store.dispatch(setRemoteStream(null));
};

export const sendMessageUsingDataChannel = (message) => {
  if (callContext.dataChannel?.readyState === "open") {
    callContext.dataChannel.send(message);
  }
};
