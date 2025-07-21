import React, { useEffect, useState } from "react";
import Chat from "./Chat";
import Detail from "./Detail";
import List from "./List";
import { useAppStore } from "@/store";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import DirectCall from "./Dashboard/components/DirectCall/DirectCall";
import { callStates } from "@/store/actions/callActions";
import { connect } from "react-redux";

import { getLocalStream } from "@/utils/webRTC/webRTCHandler";
import Search from "./Search";


function Home({username,callState}) {
  const { userInfo } = useAppStore();
  const navigate = useNavigate();

  useEffect(() => {
    getLocalStream();
   
  }, []);

  useEffect(() => {
    if (!userInfo.profileSetUp) {
      toast("Please setup profile to continue.");
      navigate("/profile");
    }
  }, [userInfo, navigate]);

  const [isDetailVisible, setIsDetailVisible] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);

  const toggleDetail = () => {
    setIsDetailVisible((prev) => !prev);
  };


  const toggleSearch = () => {
    setIsSearchVisible((prev) => !prev);
  };


  return (
    <div >
      
        <DirectCall/>

      

      {callState !== callStates.CALL_IN_PROGRESS && (
            // <DashboardInformation username={username} />
            <div className="flex h-screen">

                <div className="flex-grow flex-shrink basis-1/4">
                  <List />
                </div>
                <div className="flex-grow flex-shrink basis-1/2">
                      <Chat onToggleDetail={toggleDetail} onToggleSearch={toggleSearch} />
                    
                </div>
                { (isDetailVisible || isSearchVisible) && (
                    <div className="flex-grow flex-shrink basis-1/4">
                            {isDetailVisible && (
                              <Detail onClose={toggleDetail} />
                            )}
                            {isSearchVisible && (
                              
                                <Search onClose={toggleSearch} />
                            
                            )}
                        
                      </div>)

                }
                
                
            </div>
      )}
  
     </div>
  );
}



const mapStateToProps = ({ call, Home }) => ({
  ...call,
  ...Home,
});

export default connect(mapStateToProps)(Home);


