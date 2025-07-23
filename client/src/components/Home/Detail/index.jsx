import React, { useState ,useEffect} from "react";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store";
import { apiClient } from "@/lib/api-client.js";
import { DELETE_CHAT_ROUTE, UNFRIEND_ROUTE} from "@/utils/constants.js";
import { toast } from "sonner";
import { BLOCK_USER_ROUTE } from "@/utils/constants";
import { UNBLOCK_USER_ROUTE } from "@/utils/constants";

function Detail({ onClose}) {
  const [isBlocked, setIsBlocked] = useState(false);
  const { userInfo,selectedChatData,setSelectedChatData, setFriends,setSelectedChatMessages,removeFriend } = useAppStore();
 

 useEffect(() => {
  // Check if the selected chat user is blocked
  const checkIfBlocked = async () => {
    if (userInfo.blockedUsers.includes(selectedChatData._id)) {
      // Replace this with your actual logic to determine if the user is blocked
      setIsBlocked(true); // Assuming `isBlocked` is part of selectedChatData
    }
  };
  checkIfBlocked();
}, [selectedChatData]);



  const deleteChat = async () => {
    try {
      const response = await apiClient.post(
        DELETE_CHAT_ROUTE,
        { id: selectedChatData._id },
        { withCredentials: true }
      );
      if (response.data.messages) {
        setSelectedChatMessages(response.data.messages);
        toast.success("Chat Deleted Successfully");
      }
    } catch (err) {
      console.log("Error deleting chat:", err);
    }
  };

  const unFriend = async () => {
    try {
        const response = await apiClient.post(
            UNFRIEND_ROUTE,
            { id: selectedChatData?._id },
            { withCredentials: true }
        );
        toast.success("Unfriend Successful");
        // Remove from Zustand store
        // removeFriend(selectedChatData._id);
        removeFriend(selectedChatData._id);
        setFriends(selectedChatData._id);
        setSelectedChatData(undefined);
        onClose();
        // fetchFriendsDetails(); 
    } catch (err) {
        console.log("Error unfriending:", err);
    }
};


const handleBlockUser = async () => {
  try {
    const response=await apiClient.post(
      BLOCK_USER_ROUTE,
      { id: selectedChatData?._id }, // Ensure this is the correct property name
      { withCredentials: true }
    );
    
        window.location.reload();
      
    toast.success("User blocked successfully");
    setIsBlocked(true);
  } catch (error) {
    console.error("Failed to block user:", error);
  }
};


const handleUnblockUser = async () => {
  try {
    await apiClient.post(
      UNBLOCK_USER_ROUTE,
      { id: selectedChatData?._id }, // Ensure this correctly refers to the ID of the user to unblock
      { withCredentials: true }
    );
    toast.success("User unblocked successfully");
    window.location.reload();
    setIsBlocked(false);
  } catch (error) {
    console.error("Failed to unblock user:", error);
  }
};






  return (
    <div className="contain flex flex-col bg-gray-400 h-full">
      {/* Header */}
      <div className="contactInfo flex items-center h-[72px] shadow-xl">
        <span className="text-gray-800 flex-1 text-xl font-semibold ml-2">
          Contact Info
        </span>
        <div className="close mr-2">
          <img
            src="./clear.png"
            alt="Close"
            className="w-[20px] h-[20px] object-contain cursor-pointer"
            onClick={onClose}
          />
        </div>
      </div>
      <Separator className="bg-slate-900 mb-3" />

      <div className="container">
        {selectedChatData && (
          <>
            {/* Profile */}
            <div className="details flex flex-col items-center justify-center  mb-3">
              <div className="profile flex items-center p-1 justify-center">
                <img
                  src={selectedChatData.image || "./avatar.png"}
                  alt="Profile"
                  className="w-[100px] h-[100px] object-cover rounded-full"
                />
              </div>
              <div className="profile flex items-center  p-3 gap-2 justify-center">
                <div className="Info gap-0.5 text-nowrap flex flex-col items-center">
                  <h5 className="font-semibold text-4xl">
                    {selectedChatData.firstName + " " + selectedChatData.lastName}
                  </h5>
                  <p>{selectedChatData.email}</p>
                </div>
              </div>
              {/* Icons */}
              <div className="icons flex items-center gap-5">
                <div className="voice flex items-center flex-col">
                  <img
                    src="./phone.png"
                    alt="Voice"
                    className="w-[30px] h-[30px] object-contain"
                  />
                  <span>Voice</span>
                </div>
                <div className="video flex items-center flex-col">
                  <img
                    src="./video.png"
                    alt="Video"
                    className="w-[30px] h-[30px] object-contain"
                  />
                  <span>Video</span>
                </div>
              </div>
            </div>

            <Separator className="bg-slate-900" />

            {/* About */}
            <div className="container About flex flex-col items-start gap-2 justify-start p-2">
              <span className="font-semibold text-2xl">About</span>
              <p className="font-normal text-slate-300 text-md mb-2">
                {selectedChatData.about}
              </p>
            </div>

            <Separator className="bg-slate-900 h-[2px]" />

            {/* Media */}
            <div className="media flex flex-col gap-2">
              <div className="mediaLink flex items-center h-[40px]">
                <div className="title flex-1">
                  <span className="font-semibold text-slate-900 text-md mb-2">
                    Media, Links, Docs
                  </span>
                </div>
                <div className="count flex gap-1 items-center">
                  <p>143</p>
                  <img
                    src="./next.png"
                    alt="Next"
                    className="w-[20px] h-[20px] object-contain"
                  />
                </div>
              </div>
              <div className="images flex gap-2">
                <img
                  src="./bg.jpg"
                  alt="Media"
                  className="w-[100px] h-[100px] object-contain"
                />
                <img
                  src="./bg.jpg"
                  alt="Media"
                  className="w-[100px] h-[100px] object-contain"
                />
                <img
                  src="./bg.jpg"
                  alt="Media"
                  className="w-[100px] h-[100px] object-contain"
                />
              </div>
            </div>


            

            <Separator className="bg-slate-900 h-[2px] mt-2" />


            {/* Action buttons */}
            <div className="buttons flex gap-5 items-center p-3">
              <div>

                      {userInfo.blockedUsers.includes(selectedChatData._id) ? (
                        <Button variant="outline" className="flex gap-2 bg-red-700" onClick={handleUnblockUser}>
                <img
                  src="./block.png"
                  alt="Block"
                  className="w-[20px] h-[20px] object-contain"
                  
                  />
                UnBlock
              </Button>
              ) : (
                <Button variant="outline" className="flex gap-2 bg-red-700 " onClick={handleBlockUser}>
                        <img
                          src="./block.png"
                          alt="Block"
                          className="w-[20px] h-[20px] object-contain"
                          
                          />
                        Block
                      </Button>
              )}
              </div>
              <Button
                variant="outline"
                className="flex gap-2 bg-blue-600"
                onClick={deleteChat}
              >
                <img
                  src="./delete.png"
                  alt="Delete"
                  className="w-[20px] h-[20px] object-contain"
                />
                Delete
              </Button>
            </div>

            {/* Unfriend button */}
            <Button
              variant="outline"
              className="flex gap-2 w-full bg-gray-600"
              onClick={unFriend}
            >
              <img
                src="./Unfriend.png"
                alt="Unfriend"
                className="w-[20px] h-[20px] rounded-sm object-contain"
              />
              Unfriend
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default Detail;
