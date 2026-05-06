import { toast } from "sonner";

import { store } from "../../store/store";
import {
  callStates,
  isDirectCallBusy,
  setCallRejected,
  setGroupCallConnecting,
  clearGroupCallState,
  removeGroupCallParticipant,
  resetCallDataState,
  setCallState,
  setCallType,
  setCallerImage,
  setCallerUsername,
  setGroupCallIncoming,
  setGroupCallParticipants,
  setGroupCallSession,
  upsertGroupCallParticipant,
} from "../../store/actions/callActions";
import { useAppStore } from "@/store";
import * as wss from "../wssConnection/wssConnection";
import { getLocalStream } from "./webRTCHandler";

const isDevelopment = import.meta.env.DEV;
const logGroupCallDebug = (message, metadata = {}) => {
  if (!isDevelopment) return;
  console.debug(`[group-call] ${message}`, metadata);
};

const groupCallContext = {
  sessionId: null,
  groupId: null,
  groupName: "",
  callType: "audio",
  cancelRequestedBeforeStart: false,
  peerConnections: new Map(),
  pendingCandidates: new Map(),
};

const rtcConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const getCallState = () => store.getState().call;

const normalizeParticipant = (participant, stream = null) => ({
  userId: String(participant.userId),
  socketId: participant.socketId || null,
  username: participant.username || participant.displayName || "Member",
  displayName: participant.displayName || participant.username || "Member",
  image: participant.image || null,
  email: participant.email || null,
  stream,
});

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

const queueCandidate = (remoteUserId, candidate) => {
  const nextQueue = groupCallContext.pendingCandidates.get(remoteUserId) || [];
  nextQueue.push(candidate);
  groupCallContext.pendingCandidates.set(remoteUserId, nextQueue);
};

const flushPendingCandidates = async (remoteUserId) => {
  const peerConnection = groupCallContext.peerConnections.get(remoteUserId);
  if (!peerConnection || !peerConnection.remoteDescription) return;

  const queued = groupCallContext.pendingCandidates.get(remoteUserId) || [];
  groupCallContext.pendingCandidates.delete(remoteUserId);

  for (const candidate of queued) {
    try {
      await peerConnection.addIceCandidate(candidate);
    } catch (error) {
      console.error("Error applying queued group ICE candidate:", error);
    }
  }
};

const destroyPeerConnection = (remoteUserId) => {
  const peerConnection = groupCallContext.peerConnections.get(remoteUserId);
  if (!peerConnection) return;

  peerConnection.onicecandidate = null;
  peerConnection.ontrack = null;
  peerConnection.onconnectionstatechange = null;
  peerConnection.close();
  groupCallContext.peerConnections.delete(remoteUserId);
  groupCallContext.pendingCandidates.delete(remoteUserId);
};

const createPeerConnection = (remoteUserId) => {
  const existing = groupCallContext.peerConnections.get(remoteUserId);
  if (existing) return existing;

  const { localStream } = getCallState();
  if (!localStream) return null;

  const peerConnection = new RTCPeerConnection(rtcConfiguration);
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  if (!localStream.getAudioTracks().length) {
    logGroupCallDebug("missing_local_audio_track", { remoteUserId });
  }
  if (groupCallContext.callType === "video" && !localStream.getVideoTracks().length) {
    logGroupCallDebug("missing_local_video_track", { remoteUserId });
  }

  peerConnection.ontrack = ({ track, streams: [stream] }) => {
    logGroupCallDebug("remote_track_received", {
      remoteUserId,
      kind: track?.kind,
      hasStream: Boolean(stream),
    });
    store.dispatch(
      upsertGroupCallParticipant({
        userId: remoteUserId,
        stream,
      })
    );
  };

  peerConnection.onicecandidate = (event) => {
    if (!event.candidate || !groupCallContext.sessionId) return;

    wss.sendGroupCallCandidate({
      sessionId: groupCallContext.sessionId,
      targetUserId: remoteUserId,
      candidate: serializeIceCandidate(event.candidate),
    });
  };

  peerConnection.onconnectionstatechange = () => {
    logGroupCallDebug("peer_connection_state_changed", {
      remoteUserId,
      connectionState: peerConnection.connectionState,
    });
    if (
      ["failed", "closed", "disconnected"].includes(
        peerConnection.connectionState
      )
    ) {
      destroyPeerConnection(remoteUserId);
      store.dispatch(removeGroupCallParticipant(remoteUserId));
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    logGroupCallDebug("ice_connection_state_changed", {
      remoteUserId,
      iceConnectionState: peerConnection.iceConnectionState,
    });
  };

  groupCallContext.peerConnections.set(remoteUserId, peerConnection);
  return peerConnection;
};

const createOfferForParticipant = async (remoteUserId) => {
  const peerConnection = createPeerConnection(remoteUserId);
  if (!peerConnection) return;

  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    wss.sendGroupCallOffer({
      sessionId: groupCallContext.sessionId,
      targetUserId: remoteUserId,
      offer: serializeSessionDescription(offer),
    });
  } catch (error) {
    console.error("Error creating group call offer:", error);
    logGroupCallDebug("renegotiation_failed", {
      remoteUserId,
      stage: "create_offer",
      name: error?.name,
    });
  }
};

const cleanupGroupCall = ({ preserveLocalStream = true } = {}) => {
  [...groupCallContext.peerConnections.keys()].forEach(destroyPeerConnection);
  groupCallContext.pendingCandidates.clear();
  groupCallContext.sessionId = null;
  groupCallContext.groupId = null;
  groupCallContext.groupName = "";
  groupCallContext.callType = "audio";
  groupCallContext.cancelRequestedBeforeStart = false;

  if (!preserveLocalStream) {
    const localStream = getCallState().localStream;
    localStream?.getTracks?.().forEach((track) => track.stop());
  }

  store.dispatch(clearGroupCallState());
  store.dispatch(setGroupCallConnecting(false));
  store.dispatch(setCallState(callStates.CALL_IDLE));
};

export const startGroupCall = async ({
  groupId,
  groupName,
  participantIds = [],
  callType = "audio",
}) => {
  groupCallContext.cancelRequestedBeforeStart = false;
  const ready = await getLocalStream(callType, { skipPeerConnection: true });
  if (!ready) {
    logGroupCallDebug("permission_failure", { stage: "start_group_call", callType });
    toast.error("Unable to access microphone or camera for this group call.");
    return;
  }

  store.dispatch(setGroupCallConnecting(true));
  store.dispatch(setCallState(callStates.CALL_CALLING));

  wss.sendGroupCallStart(
    {
      groupId,
      groupName,
      participantIds,
      callType,
    },
    (ack) => {
      if (!ack?.ok) {
        store.dispatch(setGroupCallConnecting(false));
        store.dispatch(
          setCallRejected({
            rejected: true,
            reason: ack?.error || "Unable to start group call.",
          })
        );
        store.dispatch(setCallState(callStates.CALL_IDLE));
        return;
      }

      groupCallContext.sessionId = ack.sessionId;
      groupCallContext.groupId = ack.groupId;
      groupCallContext.groupName = ack.groupName;
      groupCallContext.callType = ack.callType;

      if (groupCallContext.cancelRequestedBeforeStart) {
        wss.sendGroupCallLeave({ sessionId: ack.sessionId });
        cleanupGroupCall();
        return;
      }

      const localUserId = String(useAppStore.getState().userInfo?.id || "");
      const localStream = getCallState().localStream;
      const participants = (ack.participants || []).map((participant) =>
        normalizeParticipant(
          participant,
          String(participant.userId) === localUserId ? localStream : null
        )
      );

      store.dispatch(
        setGroupCallSession({
          sessionId: ack.sessionId,
          groupId: ack.groupId,
          groupName: ack.groupName,
          callType: ack.callType,
        })
      );
      store.dispatch(setGroupCallParticipants(participants));
      store.dispatch(setGroupCallConnecting(false));
      store.dispatch(setCallState(callStates.CALL_CONNECTED));
    }
  );
};

export const handleIncomingGroupCall = (data) => {
  const currentCallState = getCallState();
  if (
    currentCallState.groupCallIncoming ||
    currentCallState.groupCallSession ||
    isDirectCallBusy(currentCallState.callState)
  ) {
    wss.sendGroupCallReject({ sessionId: data.sessionId });
    return;
  }

  store.dispatch(resetCallDataState());
  store.dispatch(
    setCallRejected({
      rejected: false,
      reason: "",
    })
  );
  store.dispatch(setCallerUsername(data.callerUsername || "Group member"));
  store.dispatch(setCallerImage(data.callerImage || null));
  store.dispatch(setCallType(data.callType || "audio"));
  store.dispatch(setCallState(callStates.CALL_RINGING));
  store.dispatch(
    setGroupCallIncoming({
      sessionId: data.sessionId,
      groupId: data.groupId,
      groupName: data.groupName,
      callType: data.callType || "audio",
      callerUserId: data.callerUserId,
      callerUsername: data.callerUsername || "Group member",
      callerImage: data.callerImage || null,
      invitedCount: data.invitedCount || 0,
    })
  );
};

export const acceptIncomingGroupCallRequest = async () => {
  const incoming = getCallState().groupCallIncoming;
  if (!incoming?.sessionId) return;

  const ready = await getLocalStream(incoming.callType, {
    skipPeerConnection: true,
  });
  if (!ready) {
    logGroupCallDebug("permission_failure", {
      stage: "accept_group_call",
      callType: incoming.callType,
    });
    toast.error("Unable to access microphone or camera for this group call.");
    wss.sendGroupCallReject({ sessionId: incoming.sessionId });
    store.dispatch(setGroupCallIncoming(null));
    store.dispatch(setGroupCallConnecting(false));
    store.dispatch(clearGroupCallState());
    store.dispatch(setCallState(callStates.CALL_IDLE));
    return;
  }

  groupCallContext.sessionId = incoming.sessionId;
  groupCallContext.groupId = incoming.groupId;
  groupCallContext.groupName = incoming.groupName;
  groupCallContext.callType = incoming.callType || "audio";

  store.dispatch(setGroupCallIncoming(null));
  store.dispatch(
    setGroupCallSession({
      sessionId: incoming.sessionId,
      groupId: incoming.groupId,
      groupName: incoming.groupName,
      callType: incoming.callType || "audio",
    })
  );
  store.dispatch(setGroupCallConnecting(true));
  store.dispatch(setCallState(callStates.CALL_CONNECTED));
  wss.sendGroupCallAccept({ sessionId: incoming.sessionId }, (ack) => {
    if (!ack?.ok) {
      toast.error(ack?.error || "Unable to join group call.");
      cleanupGroupCall();
      store.dispatch(setGroupCallConnecting(false));
      store.dispatch(setCallState(callStates.CALL_IDLE));
    }
  });
};

export const rejectIncomingGroupCallRequest = () => {
  const incoming = getCallState().groupCallIncoming;
  if (!incoming?.sessionId) return;

  wss.sendGroupCallReject({ sessionId: incoming.sessionId });
  store.dispatch(setGroupCallIncoming(null));
  store.dispatch(clearGroupCallState());
  store.dispatch(setGroupCallConnecting(false));
  store.dispatch(setCallState(callStates.CALL_IDLE));
};

export const handleGroupCallJoined = (data) => {
  const localUserId = String(useAppStore.getState().userInfo?.id || "");
  const localStream = getCallState().localStream;

  groupCallContext.sessionId = data.sessionId;
  groupCallContext.groupId = data.groupId;
  groupCallContext.groupName = data.groupName;
  groupCallContext.callType = data.callType || "audio";

  store.dispatch(
    setGroupCallSession({
      sessionId: data.sessionId,
      groupId: data.groupId,
      groupName: data.groupName,
      callType: data.callType,
    })
  );
  store.dispatch(setGroupCallIncoming(null));
  store.dispatch(
    setGroupCallParticipants(
      (data.participants || []).map((participant) =>
        normalizeParticipant(
          participant,
          String(participant.userId) === localUserId ? localStream : null
        )
      )
  )
  );
  store.dispatch(setGroupCallConnecting(false));
  store.dispatch(setCallState(callStates.CALL_CONNECTED));
};

export const handleGroupCallParticipants = (data) => {
  const localUserId = String(useAppStore.getState().userInfo?.id || "");
  const localStream = getCallState().localStream;

  store.dispatch(
    setGroupCallParticipants(
      (data.participants || []).map((participant) =>
        normalizeParticipant(
          participant,
          String(participant.userId) === localUserId ? localStream : null
        )
      )
    )
  );
};

export const handleGroupCallParticipantJoined = async ({ sessionId, participant }) => {
  if (sessionId !== groupCallContext.sessionId || !participant?.userId) return;

  store.dispatch(upsertGroupCallParticipant(normalizeParticipant(participant)));
  await createOfferForParticipant(String(participant.userId));
};

export const handleGroupCallOffer = async ({ sessionId, senderUserId, offer }) => {
  if (!offer || sessionId !== groupCallContext.sessionId || !senderUserId) return;

  const peerConnection = createPeerConnection(String(senderUserId));
  if (!peerConnection) return;

  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    wss.sendGroupCallAnswer({
      sessionId,
      targetUserId: senderUserId,
      answer: serializeSessionDescription(answer),
    });

    await flushPendingCandidates(String(senderUserId));
  } catch (error) {
    console.error("Error handling group call offer:", error);
    logGroupCallDebug("renegotiation_failed", {
      remoteUserId: senderUserId,
      stage: "handle_offer",
      name: error?.name,
    });
  }
};

export const handleGroupCallAnswer = async ({ sessionId, senderUserId, answer }) => {
  if (!answer || sessionId !== groupCallContext.sessionId || !senderUserId) return;

  const peerConnection = groupCallContext.peerConnections.get(String(senderUserId));
  if (!peerConnection) return;

  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    await flushPendingCandidates(String(senderUserId));
  } catch (error) {
    console.error("Error handling group call answer:", error);
    logGroupCallDebug("renegotiation_failed", {
      remoteUserId: senderUserId,
      stage: "handle_answer",
      name: error?.name,
    });
  }
};

export const handleGroupCallCandidate = async ({
  sessionId,
  senderUserId,
  candidate,
}) => {
  if (!candidate || sessionId !== groupCallContext.sessionId || !senderUserId) return;

  const rtcCandidate = new RTCIceCandidate(candidate);
  const peerConnection = groupCallContext.peerConnections.get(String(senderUserId));

  if (!peerConnection || !peerConnection.remoteDescription) {
    queueCandidate(String(senderUserId), rtcCandidate);
    return;
  }

  try {
    await peerConnection.addIceCandidate(rtcCandidate);
  } catch (error) {
    console.error("Error adding group ICE candidate:", error);
  }
};

export const handleGroupCallParticipantLeft = ({ sessionId, userId }) => {
  if (sessionId !== groupCallContext.sessionId || !userId) return;

  destroyPeerConnection(String(userId));
  store.dispatch(removeGroupCallParticipant(String(userId)));
};

export const handleGroupCallEnded = ({ sessionId, reason }) => {
  if (sessionId && sessionId !== groupCallContext.sessionId) return;

  cleanupGroupCall();
  if (reason && reason !== "left") {
    toast.info(
      reason === "disconnect"
        ? "Group call ended because participants disconnected."
        : "Group call ended."
    );
  }
};

export const leaveCurrentGroupCall = () => {
  if (!groupCallContext.sessionId) {
    if (getCallState().groupCallConnecting) {
      groupCallContext.cancelRequestedBeforeStart = true;
      cleanupGroupCall();
    }
    return;
  }

  wss.sendGroupCallLeave({ sessionId: groupCallContext.sessionId });
  cleanupGroupCall();
};
