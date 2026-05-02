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
import { CALLS_ICE_CONFIG_ROUTE } from "../constants.js";
import * as wss from "../wssConnection/wssConnection";

const preOfferAnswers = {
  CALL_ACCEPTED: "CALL_ACCEPTED",
  CALL_REJECTED: "CALL_REJECTED",
  CALL_NOT_AVAILABLE: "CALL_NOT_AVAILABLE",
  CALL_BUSY: "CALL_BUSY",
};

let rtcConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

let iceConfigurationPromise = null;

const callContext = {
  sessionId: null,
  remoteUserId: null,
  remoteSocketId: null,
  callType: "video",
  peerConnection: null,
  dataChannel: null,
  pendingCandidates: [],
  screenSharingStream: null,
};

const getMediaConstraints = (callType) => ({
  video: callType === "video",
  audio: true,
});

const getCallState = () => store.getState().call;

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

const stopStreamTracks = (stream) => {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
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
  if (callContext.peerConnection) {
    callContext.peerConnection.onicecandidate = null;
    callContext.peerConnection.ontrack = null;
    callContext.peerConnection.ondatachannel = null;
    callContext.peerConnection.onconnectionstatechange = null;
    callContext.peerConnection.close();
  }

  callContext.peerConnection = null;
  callContext.dataChannel = null;
  callContext.pendingCandidates = [];
};

const createDataChannelHandlers = (dataChannel) => {
  dataChannel.onopen = () => {
    console.log("chat data channel opened");
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

const createPeerConnection = () => {
  const { localStream } = getCallState();
  if (!localStream) return null;

  closePeerConnection();
  const peerConnection = new RTCPeerConnection(rtcConfiguration);

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = ({ streams: [stream] }) => {
    stream.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });
    store.dispatch(setRemoteStream(stream));
  };

  peerConnection.ondatachannel = (event) => {
    callContext.dataChannel = event.channel;
    createDataChannelHandlers(callContext.dataChannel);
  };

  callContext.dataChannel = peerConnection.createDataChannel("chat");
  createDataChannelHandlers(callContext.dataChannel);

  peerConnection.onicecandidate = (event) => {
    if (!event.candidate || !callContext.sessionId) return;

    wss.sendWebRTCCandidate({
      sessionId: callContext.sessionId,
      candidate: serializeIceCandidate(event.candidate),
    });
  };

  peerConnection.onconnectionstatechange = () => {
    if (peerConnection.connectionState === "failed") {
      setCallRejectedState("Connection failed. Please try the call again.");
      resetCallDataAfterHangUp();
    }
  };

  callContext.peerConnection = peerConnection;
  return peerConnection;
};

export const getLocalStream = async (callType = "video", options = {}) => {
  try {
    await ensureIceConfiguration();
    callContext.callType = callType;

    const existingStream = getCallState().localStream;
    const hasAudioTrack = existingStream?.getAudioTracks?.().length > 0;
    const hasVideoTrack = existingStream?.getVideoTracks?.().length > 0;
    const canReuseStream =
      existingStream &&
      hasAudioTrack &&
      (callType === "audio" || (callType === "video" && hasVideoTrack));

    if (canReuseStream) {
      applyCallTypeToLocalStream(existingStream, callType);
      store.dispatch(setCallType(callType));
      store.dispatch(setLocalCameraEnabled(callType === "video"));
      store.dispatch(setLocalMicrophoneEnabled(true));
      store.dispatch(setCallState(callStates.CALL_AVAILABLE));

      if (!options.skipPeerConnection && !callContext.peerConnection) {
        createPeerConnection();
      }

      return true;
    }

    if (existingStream) {
      stopStreamTracks(existingStream);
    }

    const stream = await navigator.mediaDevices.getUserMedia(
      getMediaConstraints(callType)
    );
    console.log("Obtained Local Stream:", stream);

    applyCallTypeToLocalStream(stream, callType);
    store.dispatch(setLocalStream(stream));
    store.dispatch(setCallType(callType));
    store.dispatch(setLocalCameraEnabled(callType === "video"));
    store.dispatch(setLocalMicrophoneEnabled(true));
    store.dispatch(setCallState(callStates.CALL_AVAILABLE));

    if (!options.skipPeerConnection) {
      createPeerConnection();
    }
    return true;
  } catch (error) {
    console.error("Error accessing local stream:", error);
    store.dispatch(setCallState(callStates.CALL_UNAVAILABLE));
    return false;
  }
};

export const checkIfCallIsPossible = () => {
  const { callState: currentState, groupCallIncoming, groupCallSession } =
    getCallState();
  return (
    currentState !== callStates.CALL_IN_PROGRESS &&
    currentState !== callStates.CALL_REQUESTED &&
    !groupCallIncoming &&
    !groupCallSession
  );
};

export const callToOtherUser = (calleeDetails, callType = "video") => {
  if (!calleeDetails?.userId) {
    setCallRejectedState("Unable to resolve this contact for calling.");
    return;
  }

  callContext.remoteUserId = calleeDetails.userId;
  callContext.remoteSocketId = calleeDetails.socketId || null;
  callContext.callType = callType;
  callContext.sessionId = null;

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
  store.dispatch(setCallingDialogVisible(true));
  store.dispatch(setCallState(callStates.CALL_IN_PROGRESS));

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
  });
};

export const handlePreOffer = (data) => {
  if (!data?.sessionId) return;

  if (checkIfCallIsPossible()) {
    callContext.sessionId = data.sessionId;
    callContext.remoteUserId = data.callerUserId || null;
    callContext.remoteSocketId = data.callerSocketId || null;
    callContext.callType = data.callType || "video";

    store.dispatch(setCallerUsername(normalizeDisplayName(data.callerUsername)));
    store.dispatch(setCallerImage(normalizeImage(data.callerImage)));
    store.dispatch(setCallType(callContext.callType));
    store.dispatch(setLocalCameraEnabled(callContext.callType === "video"));
    store.dispatch(setCallState(callStates.CALL_REQUESTED));
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

  store.dispatch(setCallState(callStates.CALL_IN_PROGRESS));
};

export const rejectIncomingCallRequest = () => {
  wss.sendPreOfferAnswer({
    answer: preOfferAnswers.CALL_REJECTED,
    sessionId: callContext.sessionId,
  });
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
    const isReady = await getLocalStream(callContext.callType);

    if (!isReady) {
      setCallRejectedState(
        `Unable to access microphone${callContext.callType === "video" ? " or camera" : ""} for this call.`
      );
      wss.sendUserHangedUp({
        sessionId: callContext.sessionId,
      });
      resetCallData();
      return;
    }

    await sendOffer();
    return;
  }

  let rejectionReason = "Call rejected by the callee";
  if (data.answer === preOfferAnswers.CALL_BUSY) {
    rejectionReason = "This user is already in another call.";
  } else if (data.answer === preOfferAnswers.CALL_NOT_AVAILABLE) {
    rejectionReason = "Callee is not able to pick up the call right now.";
  }

  setCallRejectedState(rejectionReason);
  resetCallData();
};

export const handleOffer = async (data) => {
  if (!data?.offer || !callContext.sessionId || data.sessionId !== callContext.sessionId) {
    return;
  }

  const peerConnection = callContext.peerConnection || createPeerConnection();
  if (!peerConnection) return;

  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  wss.sendWebRTCAnswer({
    sessionId: callContext.sessionId,
    answer: serializeSessionDescription(answer),
  });

  await flushPendingCandidates();
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

  resetCallDataAfterHangUp();
};

export const hangUp = () => {
  wss.sendUserHangedUp({
    sessionId: callContext.sessionId,
  });

  resetCallDataAfterHangUp();
};

const resetCallDataAfterHangUp = () => {
  closePeerConnection();
  resetCallData();

  const { localStream, screenSharingActive } = getCallState();
  if (localStream?.getVideoTracks?.()[0]) {
    localStream.getVideoTracks()[0].enabled = true;
  }
  if (localStream?.getAudioTracks?.()[0]) {
    localStream.getAudioTracks()[0].enabled = true;
  }

  if (screenSharingActive) {
    stopStreamTracks(callContext.screenSharingStream);
    callContext.screenSharingStream = null;
  }

  store.dispatch(resetCallDataState());
};

export const resetCallData = () => {
  callContext.sessionId = null;
  callContext.remoteUserId = null;
  callContext.remoteSocketId = null;
  callContext.callType = "video";
  callContext.pendingCandidates = [];

  store.dispatch(
    setCallState(
      getCallState().localStream
        ? callStates.CALL_AVAILABLE
        : callStates.CALL_UNAVAILABLE
    )
  );
  store.dispatch(setCallType("video"));
};

export const sendMessageUsingDataChannel = (message) => {
  if (callContext.dataChannel?.readyState === "open") {
    callContext.dataChannel.send(message);
  }
};
