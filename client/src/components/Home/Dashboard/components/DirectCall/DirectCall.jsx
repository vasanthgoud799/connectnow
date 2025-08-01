import React from "react";
import { connect } from "react-redux";
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
  } = props
  return (
    
    <div className="flex h-full">
      {/* Left Section: Video and Buttons */}
      <div className="flex-grow flex flex-col justify-between relative bg-black rounded-lg shadow-lg overflow-hidden">
        {/* Local and Remote Video Views */}
        <div className="flex-grow flex justify-center items-center bg-black">
          {localStream && callState === callStates.CALL_IN_PROGRESS && (
            <LocalVideoView localStream={localStream} />
          )}
          {remoteStream && callState === callStates.CALL_IN_PROGRESS && (
            <RemoteVideoView remoteStream={remoteStream} />
          )}
        </div>

        {/* Conversation Buttons */}
        {remoteStream && callState === callStates.CALL_IN_PROGRESS && (
          <div className="absolute bottom-4 left-0 w-full px-4 py-2 flex justify-center">
            <ConversationButtons {...props} />
          </div>
        )}
      </div>

      {/* Right Section: Message Input */}
      <div className="w-1/3 flex flex-col bg-gradient-to-b from-gray-900 to-gray-800 text-white  rounded-lg shadow-2xl ml-2">
        {/* Call Rejected Dialog */}
        {callRejected.rejected && (
          <CallRejectedDialog
            reason={callRejected.reason}
            hideCallRejectedDialog={hideCallRejectedDialog}
          />
        )}

        {/* Incoming Call Dialog */}
        {callState === callStates.CALL_REQUESTED && (
          <IncomingCallDialog callerUsername={callerUsername} callerImage={callerImage} />
        )}

        {/* Calling Dialog */}
        {callingDialogVisible && <CallingDialog />}

        {/* Message List */}
        <div className="flex-grow  ">
          {remoteStream && callState === callStates.CALL_IN_PROGRESS && (
            <Messenger
              message={message}
              setDirectCallMessage={setDirectCallMessage}
            />
          )}
        </div>

        
      </div>
    </div>
  );
};

function mapStoreStateToProps({ call }) {
  // console.log(call)
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
