import React from "react";

import { callToOtherUser } from '@utils/webRTC/webRTCHandler';
import { isDirectCallBusy } from "@store/actions/callActions";

const ActiveUsersListItem = (props) => {
  const { activeUser, callState } = props;

  const handleListItemPressed = () => {
    if (!isDirectCallBusy(callState)) {
      callToOtherUser(activeUser);
    }
  };

  return (
    <div className="active_user_list_item" onClick={handleListItemPressed}>
      <div className="active_user_list_image_container">
        <img
          className="active_user_list_image"
          src="#"
          alt="userimage"
        />
      </div>
      <span className="active_user_list_text">{activeUser.username}</span>
    </div>
  );
};

export default ActiveUsersListItem;
