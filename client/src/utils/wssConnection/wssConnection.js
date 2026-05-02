import { store } from "../../store/store";
import { useAppStore } from "../../store";
import * as dashboardActions from "../../store/actions/dashboardActions";
import * as webRTCHandler from "../webRTC/webRTCHandler";
import * as groupCallHandler from "../webRTC/webRTCGroupCallHandler";
import { ensureUserE2EEIdentity } from "../../crypto/e2eeService";

const broadcastEventTypes = {
  ACTIVE_USERS: "ACTIVE_USERS",
};

let socket = null;
let connectedUserId = null;
let pendingUserRegistration = null;
let detachListeners = null;

const sanitizeRegistrationPayload = (payload) => {
  if (!payload) return null;

  return {
    userId: payload.userId,
    username: payload.username,
    displayName: payload.displayName,
    email: payload.email || null,
  };
};

const handleBroadcastEvents = (data) => {
  switch (data.event) {
    case broadcastEventTypes.ACTIVE_USERS: {
      const activeUsers = (data.activeUsers || []).filter(
        (activeUser) => String(activeUser.userId) !== String(connectedUserId)
      );
      store.dispatch(dashboardActions.setActiveUsers(activeUsers));
      break;
    }
    default:
      break;
  }
};

const attachSocketListeners = (nextSocket) => {
  const handleConnect = () => {
    console.log("Successfully connected to WebSocket server");
    console.log("Socket ID:", nextSocket.id);
    nextSocket.emit("get-active-users");

    if (pendingUserRegistration) {
      nextSocket.emit("register-new-user", pendingUserRegistration);
    }
  };

  const handleBroadcast = (data) => {
    console.log(data);
    handleBroadcastEvents(data);
  };

  const handlePreOffer = (data) => {
    webRTCHandler.handlePreOffer(data);
  };

  const handlePreOfferAnswer = (data) => {
    webRTCHandler.handlePreOfferAnswer(data);
  };

  const handleOffer = (data) => {
    webRTCHandler.handleOffer(data);
  };

  const handleAnswer = (data) => {
    webRTCHandler.handleAnswer(data);
  };

  const handleCandidate = (data) => {
    webRTCHandler.handleCandidate(data);
  };

  const handleUserHangedUp = () => {
    webRTCHandler.handleUserHangedUp();
  };

  const handleDisconnect = (reason) => {
    console.log("Disconnected from WebSocket server", { reason });
  };

  const handleGroupCallInvitation = (data) => {
    groupCallHandler.handleIncomingGroupCall(data);
  };

  const handleGroupCallJoined = (data) => {
    groupCallHandler.handleGroupCallJoined(data);
  };

  const handleGroupCallParticipants = (data) => {
    groupCallHandler.handleGroupCallParticipants(data);
  };

  const handleGroupCallParticipantJoined = (data) => {
    groupCallHandler.handleGroupCallParticipantJoined(data);
  };

  const handleGroupCallParticipantLeft = (data) => {
    groupCallHandler.handleGroupCallParticipantLeft(data);
  };

  const handleGroupCallOffer = (data) => {
    groupCallHandler.handleGroupCallOffer(data);
  };

  const handleGroupCallAnswer = (data) => {
    groupCallHandler.handleGroupCallAnswer(data);
  };

  const handleGroupCallCandidate = (data) => {
    groupCallHandler.handleGroupCallCandidate(data);
  };

  const handleGroupCallEnded = (data) => {
    groupCallHandler.handleGroupCallEnded(data);
  };

  const handleConnectError = (error) => {
    console.error("Socket connection error", {
      message: error?.message,
      description: error?.description,
      context: error?.context,
    });
  };

  const handleE2eeInitRequested = async () => {
    try {
      const normalizedUser = useAppStore.getState().userInfo || { id: connectedUserId };
      if (normalizedUser?.id) {
        await ensureUserE2EEIdentity(normalizedUser);
      }
    } catch (error) {
      console.error("Unable to initialize E2EE identity on request:", error);
    }
  };

  nextSocket.on("connect", handleConnect);
  nextSocket.on("broadcast", handleBroadcast);
  nextSocket.on("pre-offer", handlePreOffer);
  nextSocket.on("pre-offer-answer", handlePreOfferAnswer);
  nextSocket.on("webRTC-offer", handleOffer);
  nextSocket.on("webRTC-answer", handleAnswer);
  nextSocket.on("webRTC-candidate", handleCandidate);
  nextSocket.on("user-hanged-up", handleUserHangedUp);
  nextSocket.on("group_call_invitation", handleGroupCallInvitation);
  nextSocket.on("group_call_joined", handleGroupCallJoined);
  nextSocket.on("group_call_participants", handleGroupCallParticipants);
  nextSocket.on("group_call_participant_joined", handleGroupCallParticipantJoined);
  nextSocket.on("group_call_participant_left", handleGroupCallParticipantLeft);
  nextSocket.on("group_call_offer", handleGroupCallOffer);
  nextSocket.on("group_call_answer", handleGroupCallAnswer);
  nextSocket.on("group_call_candidate", handleGroupCallCandidate);
  nextSocket.on("group_call_ended", handleGroupCallEnded);
  nextSocket.on("disconnect", handleDisconnect);
  nextSocket.on("connect_error", handleConnectError);
  nextSocket.on("e2ee_init_requested", handleE2eeInitRequested);

  if (nextSocket.connected) {
    handleConnect();
  }

  return () => {
    nextSocket.off("connect", handleConnect);
    nextSocket.off("broadcast", handleBroadcast);
    nextSocket.off("pre-offer", handlePreOffer);
    nextSocket.off("pre-offer-answer", handlePreOfferAnswer);
    nextSocket.off("webRTC-offer", handleOffer);
    nextSocket.off("webRTC-answer", handleAnswer);
    nextSocket.off("webRTC-candidate", handleCandidate);
    nextSocket.off("user-hanged-up", handleUserHangedUp);
    nextSocket.off("group_call_invitation", handleGroupCallInvitation);
    nextSocket.off("group_call_joined", handleGroupCallJoined);
    nextSocket.off("group_call_participants", handleGroupCallParticipants);
    nextSocket.off("group_call_participant_joined", handleGroupCallParticipantJoined);
    nextSocket.off("group_call_participant_left", handleGroupCallParticipantLeft);
    nextSocket.off("group_call_offer", handleGroupCallOffer);
    nextSocket.off("group_call_answer", handleGroupCallAnswer);
    nextSocket.off("group_call_candidate", handleGroupCallCandidate);
    nextSocket.off("group_call_ended", handleGroupCallEnded);
    nextSocket.off("disconnect", handleDisconnect);
    nextSocket.off("connect_error", handleConnectError);
    nextSocket.off("e2ee_init_requested", handleE2eeInitRequested);
  };
};

export const connectWithWebSocket = (nextSocket, user) => {
  if (!nextSocket || !user?.id) return;

  connectedUserId = user.id;
  socket = nextSocket;
  pendingUserRegistration = {
    userId: user.id,
    username: user.firstName || user.email,
    displayName:
      [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
    email: user.email || null,
  };
  pendingUserRegistration = sanitizeRegistrationPayload(pendingUserRegistration);

  if (detachListeners) {
    detachListeners();
  }

  detachListeners = attachSocketListeners(nextSocket);
};

export const disconnectWebSocket = () => {
  if (detachListeners) {
    detachListeners();
    detachListeners = null;
  }

  socket = null;
  connectedUserId = null;
};

export const registerNewUser = (user) => {
  if (!user) return;

  pendingUserRegistration =
    typeof user === "string"
      ? {
          username: user,
          displayName: user,
        }
      : {
          userId: user.id || user.userId,
          username: user.firstName || user.username || user.email,
          displayName:
            [user.firstName, user.lastName].filter(Boolean).join(" ") ||
            user.email ||
            user.username,
          email: user.email || null,
        };
  pendingUserRegistration = sanitizeRegistrationPayload(pendingUserRegistration);

  if (!socket?.connected) return;

  socket.emit("register-new-user", pendingUserRegistration);
};

export const sendPreOffer = (data) => {
  socket?.emit("pre-offer", data);
};

export const sendPreOfferAnswer = (data) => {
  socket?.emit("pre-offer-answer", data);
};

export const sendWebRTCOffer = (data) => {
  socket?.emit("webRTC-offer", data);
};

export const sendWebRTCAnswer = (data) => {
  socket?.emit("webRTC-answer", data);
};

export const sendWebRTCCandidate = (data) => {
  socket?.emit("webRTC-candidate", data);
};

export const sendUserHangedUp = (data) => {
  socket?.emit("user-hanged-up", data);
};

export const sendGroupCallStart = (data, callback) => {
  socket?.emit("group_call_start", data, callback);
};

export const sendGroupCallAccept = (data, callback) => {
  socket?.emit("group_call_accept", data, callback);
};

export const sendGroupCallReject = (data, callback) => {
  socket?.emit("group_call_reject", data, callback);
};

export const sendGroupCallOffer = (data) => {
  socket?.emit("group_call_offer", data);
};

export const sendGroupCallAnswer = (data) => {
  socket?.emit("group_call_answer", data);
};

export const sendGroupCallCandidate = (data) => {
  socket?.emit("group_call_candidate", data);
};

export const sendGroupCallLeave = (data, callback) => {
  socket?.emit("group_call_leave", data, callback);
};

export const requestRemoteE2eeInit = (data) => {
  socket?.emit("request_e2ee_init", data);
};
