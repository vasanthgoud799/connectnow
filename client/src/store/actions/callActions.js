export const callStates = {
  CALL_UNAVAILABLE: "CALL_UNAVAILABLE",
  CALL_AVAILABLE: "CALL_AVAILABLE",
  CALL_REQUESTED: "CALL_REQUESTED",
  CALL_IN_PROGRESS: "CALL_IN_PROGRESS",
};

export const CALL_SET_LOCAL_STREAM = "CALL.SET_LOCAL_STREAM";
export const CALL_SET_CALL_STATE = "CALL.SET_CALL_STATE";
export const CALL_SET_CALLING_DIALOG_VISIBLE =
  "CALL.SET_CALLING_DIALOG_VISIBLE";
export const CALL_SET_CALLER_USERNAME = "CALL.SET_CALLER_USERNAME";
export const CALL_SET_CALLER_IMAGE = "CALL.SET_CALLER_IMAGE";
export const CALL_SET_CALL_REJECTED = "CALL.SET_CALL_REJECTED";
export const CALL_SET_REMOTE_STREAM = "CALL.SET_REMOTE_STREAM";
export const CALL_SET_CALL_TYPE = "CALL.SET_CALL_TYPE";
export const CALL_SET_LOCAL_MICROPHONE_ENABLED =
  "CALL.SET_LOCAL_MICROPHONE_ENABLED";
export const CALL_SET_LOCAL_CAMERA_ENABLED = "CALL.SET_LOCAL_CAMERA_ENABLED";
export const CALL_SET_SCREEN_SHARING_ACTIVE = "CALL.SET_SCREEN_SHARING_ACTIVE";
export const CALL_RESET_CALL_STATE = "CALL.RESET_CALL_STATE";
export const CALL_SET_CHAT_MESSAGE = "CALL.SET_CHAT_MESSAGE";
export const CALL_SET_GROUP_CALL_INCOMING = "CALL.SET_GROUP_CALL_INCOMING";
export const CALL_SET_GROUP_CALL_SESSION = "CALL.SET_GROUP_CALL_SESSION";
export const CALL_SET_GROUP_CALL_CONNECTING = "CALL.SET_GROUP_CALL_CONNECTING";
export const CALL_SET_GROUP_CALL_PARTICIPANTS =
  "CALL.SET_GROUP_CALL_PARTICIPANTS";
export const CALL_UPSERT_GROUP_CALL_PARTICIPANT =
  "CALL.UPSERT_GROUP_CALL_PARTICIPANT";
export const CALL_REMOVE_GROUP_CALL_PARTICIPANT =
  "CALL.REMOVE_GROUP_CALL_PARTICIPANT";
export const CALL_CLEAR_GROUP_CALL_STATE = "CALL.CLEAR_GROUP_CALL_STATE";

// Action creators

export const setLocalStream = (localStream) => {
  return {
    type: CALL_SET_LOCAL_STREAM,
    localStream,
  };
};

export const setCallState = (callState) => {
  return {
    type: CALL_SET_CALL_STATE,
    callState,
  };
};

export const setCallingDialogVisible = (visible) => {
  return {
    type: CALL_SET_CALLING_DIALOG_VISIBLE,
    visible,
  };
};

export const setCallerUsername = (callerUsername) => {
  return {
    type: CALL_SET_CALLER_USERNAME,
    callerUsername,
  };
};

export const setCallerImage = (callerImage) => {
  return {
    type: CALL_SET_CALLER_IMAGE,
    callerImage,
  };
};

export const setCallRejected = (callRejectedDetails) => {
  return {
    type: CALL_SET_CALL_REJECTED,
    callRejected: {
      rejected: callRejectedDetails.rejected,
      reason: callRejectedDetails.reason,
    },
  };
};

export const setRemoteStream = (remoteStream) => {
  return {
    type: CALL_SET_REMOTE_STREAM,
    remoteStream,
  };
};

export const setCallType = (callType) => {
  return {
    type: CALL_SET_CALL_TYPE,
    callType,
  };
};

export const setLocalMicrophoneEnabled = (enabled) => {
  return {
    type: CALL_SET_LOCAL_MICROPHONE_ENABLED,
    enabled,
  };
};

export const setLocalCameraEnabled = (enabled) => {
  return {
    type: CALL_SET_LOCAL_CAMERA_ENABLED,
    enabled,
  };
};

export const setScreenSharingActive = (active) => {
  return {
    type: CALL_SET_SCREEN_SHARING_ACTIVE,
    active,
  };
};

export const resetCallDataState = () => {
  return {
    type: CALL_RESET_CALL_STATE,
  };
};

// Removed group call-related actions

export const setMessage = (messageReceived, messageContent) => {
  return {
    type: CALL_SET_CHAT_MESSAGE,
    message: {
      received: messageReceived,
      content: messageContent,
    },
  };
};

export const setGroupCallIncoming = (incomingCall) => {
  return {
    type: CALL_SET_GROUP_CALL_INCOMING,
    incomingCall,
  };
};

export const setGroupCallSession = (session) => {
  return {
    type: CALL_SET_GROUP_CALL_SESSION,
    session,
  };
};

export const setGroupCallConnecting = (connecting) => {
  return {
    type: CALL_SET_GROUP_CALL_CONNECTING,
    connecting,
  };
};

export const setGroupCallParticipants = (participants) => {
  return {
    type: CALL_SET_GROUP_CALL_PARTICIPANTS,
    participants,
  };
};

export const upsertGroupCallParticipant = (participant) => {
  return {
    type: CALL_UPSERT_GROUP_CALL_PARTICIPANT,
    participant,
  };
};

export const removeGroupCallParticipant = (userId) => {
  return {
    type: CALL_REMOVE_GROUP_CALL_PARTICIPANT,
    userId,
  };
};

export const clearGroupCallState = () => {
  return {
    type: CALL_CLEAR_GROUP_CALL_STATE,
  };
};
