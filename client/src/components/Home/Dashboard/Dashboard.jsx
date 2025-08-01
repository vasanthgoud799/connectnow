import React, { useEffect } from "react";
import ActiveUsersList from "./components/ActiveUsersList/ActiveUsersList";
import * as webRTCHandler from "@utils/webRTC/webRTCHandler";

import DirectCall from "./components/DirectCall/DirectCall";
import { connect } from "react-redux";
import DashboardInformation from "./components/Dashboardinformation/Dashboardinformation";
import { callStates } from "@store/actions/callActions";

import "./Dashboard.css";

const Dashboard = ({ username, callState }) => {
  useEffect(() => {
    webRTCHandler.getLocalStream();
    // Remove group call handler setup
    // webRTCGroupHandler.connectWithMyPeer(); // Removed
  }, []);

  return (
    <div className="dashboard_container background_main_color">
      <div className="dashboard_left_section">
        <div className="dashboard_content_container">
          <DirectCall />
        </div>
        
      </div>
      <div className="dashboard_right_section background_secondary_color">
        <div className="dashboard_active_users_list">
          <ActiveUsersList />
        </div>
      </div>
    </div>
  );
};

const mapStateToProps = ({ call, dashboard }) => ({
  ...call,
  ...dashboard,
});

export default connect(mapStateToProps)(Dashboard);
