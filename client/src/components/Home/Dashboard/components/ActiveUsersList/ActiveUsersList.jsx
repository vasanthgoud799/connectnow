import React from "react";
import ActiveUsersListItem from "./ActiveUsersListItem";
import { connect } from "react-redux";

import "./ActiveUsersList.css";

const ActiveUsersList = ({ activeUsers, callState }) => {
  console.log(activeUsers,callState)
  return (
    <div className="active_user_list_container">
      {activeUsers.map((activeUser) => (
        <ActiveUsersListItem
          key={activeUser.socketId}
          activeUser={activeUser}
          callState={callState}
        />
      ))}
    </div>
  );
};

const mapStateToProps = ({ Home, call }) => ({
  ...Home,
  ...call,
});

export default connect(mapStateToProps)(ActiveUsersList);
