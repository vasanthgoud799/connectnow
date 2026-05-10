import * as callActions from "../actions/callActions";

const initState = {
  localStream: null,
  callState: callActions.callStates.CALL_IDLE,
  callingDialogVisible: false,
  callerUsername: "",
  callerImage: "",
  callRejected: {
    rejected: false,
    reason: "",
  },
  remoteStream: null,
  callType: "video",
  localCameraEnabled: true,
  localMicrophoneEnabled: true,
  screenSharingActive: false,
  message: {
    received: false,
    content: "",
  },
  groupCallIncoming: null,
  groupCallSession: null,
  groupCallConnecting: false,
  groupCallParticipants: [],
};

const reducer = (state = initState, action) => {
  switch (action.type) {
    case callActions.CALL_SET_LOCAL_STREAM:
      return {
        ...state,
        localStream: action.localStream,
      };
    case callActions.CALL_SET_CALL_STATE:
      return {
        ...state,
        callState: action.callState,
      };
    case callActions.CALL_SET_CALLING_DIALOG_VISIBLE:
      return {
        ...state,
        callingDialogVisible: action.visible,
      };
    case callActions.CALL_SET_CALLER_USERNAME:
      return {
        ...state,
        callerUsername: action.callerUsername,
      };
    case callActions.CALL_SET_CALLER_IMAGE:
      return {
        ...state,
        callerImage: action.callerImage,
      };
    case callActions.CALL_SET_CALL_REJECTED:
      return {
        ...state,
        callRejected: action.callRejected,
      };
    case callActions.CALL_SET_REMOTE_STREAM:
      return {
        ...state,
        remoteStream: action.remoteStream,
      };
    case callActions.CALL_SET_CALL_TYPE:
      return {
        ...state,
        callType: action.callType,
      };
    case callActions.CALL_SET_LOCAL_CAMERA_ENABLED:
      return {
        ...state,
        localCameraEnabled: action.enabled,
      };
    case callActions.CALL_SET_LOCAL_MICROPHONE_ENABLED:
      return {
        ...state,
        localMicrophoneEnabled: action.enabled,
      };
    case callActions.CALL_SET_SCREEN_SHARING_ACTIVE:
      return {
        ...state,
        screenSharingActive: action.active,
      };
    case callActions.CALL_RESET_CALL_STATE:
      return {
        ...state,
        callState: callActions.callStates.CALL_IDLE,
        localStream: null,
        remoteStream: null,
        screenSharingActive: false,
        callerUsername: "",
        callerImage: "",
        callType: "video",
        localMicrophoneEnabled: true,
        localCameraEnabled: true,
        callingDialogVisible: false,
        callRejected: {
          rejected: false,
          reason: "",
        },
      };
    case callActions.CALL_SET_CHAT_MESSAGE:
      return {
        ...state,
        message: action.message,
      };
    case callActions.CALL_SET_GROUP_CALL_INCOMING:
      return {
        ...state,
        groupCallIncoming: action.incomingCall,
      };
    case callActions.CALL_SET_GROUP_CALL_SESSION:
      return {
        ...state,
        groupCallSession: action.session,
      };
    case callActions.CALL_SET_GROUP_CALL_CONNECTING:
      return {
        ...state,
        groupCallConnecting: action.connecting,
      };
    case callActions.CALL_SET_GROUP_CALL_PARTICIPANTS:
      return {
        ...state,
        groupCallParticipants: action.participants || [],
      };
    case callActions.CALL_UPSERT_GROUP_CALL_PARTICIPANT: {
      const nextParticipant = action.participant;
      const participantIndex = state.groupCallParticipants.findIndex(
        (participant) =>
          String(participant.userId) === String(nextParticipant.userId)
      );

      if (participantIndex === -1) {
        return {
          ...state,
          groupCallParticipants: [...state.groupCallParticipants, nextParticipant],
        };
      }

      const nextParticipants = [...state.groupCallParticipants];
      nextParticipants[participantIndex] = {
        ...nextParticipants[participantIndex],
        ...nextParticipant,
      };

      return {
        ...state,
        groupCallParticipants: nextParticipants,
      };
    }
    case callActions.CALL_REMOVE_GROUP_CALL_PARTICIPANT:
      return {
        ...state,
        groupCallParticipants: state.groupCallParticipants.filter(
          (participant) =>
            String(participant.userId) !== String(action.userId)
        ),
      };
    case callActions.CALL_CLEAR_GROUP_CALL_STATE:
      return {
        ...state,
        groupCallIncoming: null,
        groupCallSession: null,
        groupCallConnecting: false,
        groupCallParticipants: [],
      };
    default:
      return state;
  }
};

export default reducer;
