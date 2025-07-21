// src/components/Home/Chat/index.jsx
import React, { useRef, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import EmojiPicker from "emoji-picker-react";
import AttachmentMenu from "./AttachmentMenu";
import { useAppStore } from "@/store"; 
import { useSocket } from "@/context/SocketContext";
import useHandleReceiveMessage from "@/context/useHandleReceiveMessage"; 
import moment from "moment";
import { apiClient } from "@/lib/api-client.js";
import { GET_ALL_MESSAGES_ROUTES, UPLOAD_FILE_ROUTE } from "@/utils/constants.js";
import Loading from "./Loading";
import ImageModal from "./ImageModal";
import { toast } from "sonner";

import { useNavigate } from "react-router-dom";
import { connect } from "react-redux";
import { callStates } from "@/store/actions/callActions";
import { callToOtherUser } from "@/utils/webRTC/webRTCHandler";
import BirthDayMessage from "./BirthdayMessage";

const RINGTONE_URL = 'client\public\samsung-whistle-soundalike-105086.mp3'

function Chat({ onToggleDetail,onToggleSearch,activeUsers, callState  }) {
  const [sendBtn, setSendBtn] = useState(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [menu, openMenu] = useState(false);
  const [bdayDailog,setbdayDialog]=useState(false);
  const [attachedFile, setAttachedFile] = useState({ file: null, type: null });
  const [isModalOpen, setIsModalOpen] = useState(false); // State for modal visibility
  const [selectedImage, setSelectedImage] = useState(""); // State for the selected image URL
  const [searchQuery, setSearchQuery] = useState(""); // State for search query
  const [showSearchInput, setShowSearchInput] = useState(false); // State to toggle search input visibility
  console.log(activeUsers,callState)
  
  const {
    userInfo,
    selectedChatData,
    selectedChatMessages,
    setSelectedChatMessages,
  } = useAppStore();
  const [incomingCall, setIncomingCall] = useState(false);
  const [videoCall, setVideoCall] = useState(false);
  const [isVideoCallActive, setIsVideoCallActive] = useState(false);
  const [callerId, setCallerId] = useState(null);
  const [showCallDialog, setShowCallDialog] = useState(false);
  const [isCallAccepted, setIsCallAccepted] = useState(false);
  const [blockList, setBlockList] = useState(userInfo.blockedUsers || []);
  const [caller,setcaller]=useState();
  const socket= useSocket();
  
  
  const ringtoneRef = useRef(null);



  useHandleReceiveMessage(socket);
  



const toggleBdayDialog=()=>{
  setbdayDialog((prev)=>!prev);
}



   // Call functions for initiating, accepting, and rejecting calls
   const initiateCall = () => {
  //   if (!isUserBlocked()) {
  //     setIsVideoCallActive(true);
  //     setIncomingCall(true);
      
  //     socket.emit('initiateCall', { caller:userInfo,callerId: userInfo.id, recipientId: selectedChatData._id });
  //     const data={ caller:userInfo,callerId: userInfo.id,recipientId: selectedChatData._id }
  //     socket.emit("pre-offer", { caller:userInfo,callerId: userInfo.id,recipientId: selectedChatData._id });
  //     // Optional: Close the video call after 30 seconds if not answered
  //     setTimeout(() => {
  //       if (incomingCall) {
  //         toast.error("Call not answered, closing dialog");
  //         setIsVideoCallActive(false);
  //         setIncomingCall(false); // Reset incoming call state
  //       }
  //     }, 30000);
  //   }
  const activeUser = activeUsers.find(activeUser=> activeUser.username === selectedChatData?.firstName);
  console.log(activeUser)
        if (callState === callStates.CALL_AVAILABLE) {
          callToOtherUser(activeUser);
        }
         
  };
   
  // const handleAcceptCall = () => {
  //   setVideoCall(true);
  //   setShowCallDialog(false);
  //   setIncomingCall(false);
  //   setIsCallAccepted(true);
  //   navigate("/VideoCall");
  // };
  
  // const handleRejectCall = () => {
  //   // stopRingtone();
  //   setVideoCall(false);
  //   setShowCallDialog(false);
  //   setIncomingCall(false);
  //   setIsCallAccepted(true);
  // };


  const isUserBlocked = () => {
    return blockList?.includes(selectedChatData._id);
  };

  // useEffect(() => {
  //   if (!socket) return;
    
  //   socket.on('incoming-call', (data) => {
  //     // console.log("INNNN")
  //     // playRingtone();
  //     setShowCallDialog(true);
  //     setcaller(data.caller)
  //     console.log(data.caller)
  //     setCallerId(data.callerId);

  //   });

  //   return () => {
  //     socket.off('incoming-call');
  //   };
  // }, [socket]);

 
  
  
  useEffect(() => {
    if (userInfo.blockedUsers && userInfo.blockedUsers.length > 0) {
        setBlockList(userInfo.blockedUsers);
        // isUserBlocked();
    } else {
        setBlockList([]);
    }
}, [userInfo.blockedUsers]);



  const messagesContainerRef = useRef(null);
  const endRef = useRef(null);

  // Handle input changes
  const toggleButton = (e) => {
    const inputValue = e.target.value;
    setText(inputValue);
    setSendBtn(inputValue.trim() !== "" || attachedFile.file !== null);
  };




  useEffect(() => {
    // Listen for the "birthday-message" event from the server
    if (socket) {
    socket.on("birthday-message", (data) => {
      console.log("Helloo");
      console.log(data)
      const { friendId, friendName, message } = data;
      console.log(`Received birthday message for ${friendName}: ${message}`);

      
      sendBirthdayMessage(friendId, message);
    });
    
    return () => {
      // Clean up the event listener on component unmount
      socket.off("birthday-message");
    };
  }
  }, []);

  const sendBirthdayMessage = (friendId, message) => {
    const messageData = {
      sender: userInfo.id,  // Replace with the actual sender ID
      recipient: friendId,
      content: message,
      messageType: "text",  // Adjust message type as needed
      timestamp: new Date(),
    };

    // Emit the message to the server (or you can call an API to save it in the database)
    socket.emit("sendMessage", messageData);
  };





  // Handle emoji selection
  const handleEmojiClick = (e) => {
    const emoji = e.emoji;
    const updatedText = text + emoji;
    setText(updatedText);
    setSendBtn(updatedText.trim() !== "" || attachedFile.file !== null);
    setOpen(false);
  };

  
  // Function to send messages
  const handleSendMessage = async () => {
    if (!sendBtn && !attachedFile.file)
      {
        
        return; // Prevent sending if both are false
      }
      if (isUserBlocked()) return;

    if (socket && userInfo && selectedChatData) {
      let messageType = "text";
      let fileUrl;

      if (attachedFile.file) {
        // Log the attached file type and MIME type
        console.log(`Attached File Type: ${attachedFile.type}`);
        console.log(`MIME Type: ${attachedFile.file.type}`);

        // Map MIME type to general messageType
        if (attachedFile.type.startsWith("image/") || attachedFile.file.type.startsWith("image/")) {
          messageType = "image";
        } else if (attachedFile.type.startsWith("video/") || attachedFile.file.type.startsWith("video/")) {
          messageType = "video";
        } else if (attachedFile.type.startsWith("audio/") || attachedFile.file.type.startsWith("audio/")) {
          messageType = "audio";
        } else {
          messageType = "document";
        }

        console.log(`Determined messageType: ${messageType}`); // Debugging

        try {
          fileUrl = await uploadFile(attachedFile.file);
        } catch (error) {
          console.error("Error uploading file:", error);
          alert("Failed to upload the file. Please try again.");
          return;
        }
      }

      const message = {
        id: `${Date.now()}-${Math.random()}`,
        sender: userInfo.id,
        content: messageType === "text" ? text :getMessageContent(messageType),
        recipient: selectedChatData._id,
        messageType: messageType,
        fileUrl: fileUrl,
        timestamp: new Date().toISOString(),
      };
      function getMessageContent(type) {
        switch (type) {
          case "image":
            return "📷 Image";
          case "video":
            return "◀ Video";
          case "document":
            return "📄 Document";
          case "audio":
            return "⏯ Audio";
          default:
            return "Unsupported message type";
        }
      }
      console.log("Sending message:", message); // Debugging
      
      socket.emit("sendMessage", message);

      // **Optional:** Optimistic UI Update (Immediate Feedback)
      // Uncomment the following line if you have `addMessages` in store
      // addMessages(message);

      setText(""); // Clear text after sending
      setAttachedFile({ file: null, type: null }); // Reset attached file
      setSendBtn(false); // Reset send button state
    } else {
      console.error("socket, userInfo, or selectedChatData is not defined");
    }
  };

  // Function to upload files
  const uploadFile = async (file) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const response = await apiClient.post(UPLOAD_FILE_ROUTE, formData, {
        withCredentials: true,
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const fileUrl = response.data.fileUrl; // Server returns the full URL

      console.log("File uploaded successfully:", fileUrl); // Debugging

      return fileUrl;
    } catch (error) {
      console.error("File upload failed:", error);
      throw error;
    }
  };

  // Function to filter messages relevant to the selected chat
  const getFilteredMessages = () => {
    const messages = Array.isArray(selectedChatMessages) ? selectedChatMessages : [];
    if (!selectedChatData?._id) return [];
    return messages.filter(
      (message) =>
        message.recipient === selectedChatData._id ||
        message.sender === selectedChatData._id
    );
  };
  

  const filteredMessages = getFilteredMessages();

  // Function to render all messages
  const renderMessages = () => {
    let lastDate = null;

    return filteredMessages.map((message) => {
      const messageDate = moment(message.timestamp).format("YYYY-MM-DD");
      const showDate = messageDate !== lastDate;
      lastDate = messageDate;

      return (
        <div key={message._id || message.id || message.timestamp}>
          {showDate && (
            <div className="text-center text-white my-2">
              {moment(message.timestamp).format("LL")}
            </div>
          )}
          {renderDMMessages(message)}
        </div>
      );
    });
  };

  // Function to render individual message
  const renderDMMessages = (message) => {
    const isSender = message.sender === userInfo.id;

    return (
      <div className={`${isSender ? "text-right" : "text-left"} mb-2`}>
        {message.messageType === "text" && (
          <div
            className={`${
              isSender ? "bg-gray-500" : "bg-slate-300"
            } border inline-block p-2 rounded max-w-[50%] break-words`}
          >
            {message.content}
          </div>
        )}
        {message.fileUrl && (
          <div
            className={`border inline-block p-2 rounded max-w-[50%] ${
              isSender ? "bg-gray-500" : "bg-slate-300"
            }`}
          >
            {message.messageType === "image" && (
              <img
                src={message.fileUrl}
                alt="Attached"
                className="w-[400px] h-[400px] object-contain"
              />
            )}
            {message.messageType === "video" && (
              <video controls className="w-[400px] h-[400px] object-contain">
                <source src={message.fileUrl} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            )}
            {message.messageType === "audio" && (
              <audio controls> 
              <source src={message.fileUrl} type="audio/mpeg" />
              Your browser does not support the audio element.
            </audio>

            )}
            {message.messageType === "document" && (
              
              <a href={message.fileUrl} download className="text-blue-400">
                📄 {message.fileUrl.split("/").reverse()[0]}
              </a>
            )}
          </div>
        )}
        <div className="text-xs text-gray-100 mt-1">
          {moment(message.timestamp).format("LT")}
        </div>
      </div>
    );
  };

  // Fetch messages when selectedChatData changes
  useEffect(() => {
    const getMessages = async () => {
      try {
        const response = await apiClient.post(
          GET_ALL_MESSAGES_ROUTES,
          { id: selectedChatData._id },
          { withCredentials: true }
        );
        if (response.data.messages) {
          setSelectedChatMessages(response.data.messages);
        }
      } catch (err) {
        console.log("Error fetching messages:", err);
      }
    };

    if (selectedChatData && selectedChatData._id) {
      getMessages();
    }
  }, [selectedChatData, setSelectedChatMessages]);

  useEffect(() => {
    const scrollToBottom = () => {
      if (endRef.current) {
        endRef.current.scrollIntoView({ behavior: "smooth" });
      }
    };
  
    // Timeout to allow images/videos to load
    const timeoutId = setTimeout(scrollToBottom, 10); // Adjust time as needed
  
    return () => clearTimeout(timeoutId);
  }, [selectedChatMessages]);

  // Loading state
  if (!userInfo || !selectedChatData) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-800">
            <Loading />
        </div>
    );
  }
  

  return (
    <div className="flex flex-col h-full border-l border-r border-slate-800 bg-gray-600">
      {/* Header */}
      <div className="header flex border-b border-slate-700 p-2">
        <div className="profile mr-2">
      <audio ref={ringtoneRef} src={RINGTONE_URL} loop />
          <img
            src={selectedChatData?.image || "./avatar.png"}
            alt="Profile"
            className="rounded-full w-[50px] h-[50px] object-cover cursor-pointer"
            onClick={() => {
              setSelectedImage(selectedChatData?.image); // Set the selected image URL
              setIsModalOpen(true); // Open the modal
            }}
          />
        </div>
        <div className="name text-gray-200 flex flex-col items-start flex-1">
          <p className="font-bold font-sans text-2xl cursor-pointer">
            {selectedChatData?.firstName || "Loading..."}
          </p>
          <span className={
  activeUsers.some(user => user.username === selectedChatData?.firstName)
    ? 'text-green-500'
    : 'text-gray-500'
}>
  {activeUsers.some(user => user.username === selectedChatData?.firstName)
    ? 'Online'
    : 'Offline'}
</span>


        </div>
        <div className="icons flex gap-3 row-end-1 p-1">
          <img
            src="/video.png"
            alt="Video Call"
            className="w-[22px] object-contain cursor-pointer"
            onClick={initiateCall}
          />
          <img
            src="/birthday.png"
            alt="Phone Call"
            onClick={toggleBdayDialog}
            className="w-[22px] object-contain cursor-pointer"
          />
          <img
            src="/search.png"
            alt="Search"
            onClick={onToggleSearch}
            className="w-[22px] object-contain cursor-pointer"
          />
         

      
     
          <img
            src="/arrowDown.png"
            alt="Options"
            className="w-[22px] cursor-pointer object-contain"
            onClick={onToggleDetail} // Toggle detail panel
          />
      
        </div>
        
      </div>

     

      {/* Messages */}
      <div ref={messagesContainerRef} className="center overflow-y-auto scrollbar-hide flex-1 flex flex-col bg-[url('./Chatbg.png')] bg-cover bg-center p-4 space-y-4">
  {renderMessages()}
  <div ref={endRef}></div>
</div>

      {/* Input Area */}
      <div className="bottom flex p-2 border-t border-slate-700 relative">
        <div className="icons flex p-2 gap-2">
          <img
            src="/emoji.png"
            alt="Emoji Picker"
            className="w-[22px] h-[22px] rounded-full cursor-pointer object-contain"
            onClick={() =>{
              setOpen((prev) => !prev);  setSendBtn(true)
            } }
          />
          <img
            src="/plus.png"
            alt="Attachment Menu"
            className={`w-[22px] h-[22px] rounded-full cursor-pointer object-contain transform transition-transform duration-200 ${
              menu ? "rotate-45 bg-slate-700 p-1" : ""
            }`}
            onClick={() => openMenu((prev) => !prev)}
          />
        </div>
        {open && (
          <div className="absolute bottom-14 left-2">
            <EmojiPicker onEmojiClick={handleEmojiClick} />
          </div>
        )}
        {menu && (
          <div className="absolute bottom-2 left-2">
            <AttachmentMenu onAttach={(file, type) => {setAttachedFile({ file, type })
          openMenu(false)
          setSendBtn(true)}} />
          </div>
        )}
        <Input
          placeholder={isUserBlocked()?"You cannot send message......":"Type a message..."}
          value={text}
          onChange={toggleButton}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); // Prevent default behavior (like form submission)
              handleSendMessage();
            }
          }}
          disabled={isUserBlocked()} 
          className="rounded-3 bg-slate-700 text-white border-0 focus:outline-none flex-1"
          style={{ boxShadow: "none", outline: "none", border: "none" }}
        />
        <div className="send flex items-center p-2">
          <img
            src={sendBtn ? "./send.png" : "./mic.png"}
            alt={sendBtn ? "Send" : "Mic"}
            className="w-[22px] h-[22px] rounded-full cursor-pointer object-contain"
            onClick={handleSendMessage}
          />
        </div>
      </div>
      
       <ImageModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        imageUrl={selectedImage}
      />
       {bdayDailog && (<BirthDayMessage friend={selectedChatData} onClose={() => setbdayDialog(false) }/>)}
       
     
    </div>
  );
}
const mapStateToProps = ({ Home, call }) => ({
  ...Home,
  ...call,
});
export default connect(mapStateToProps)(Chat);
