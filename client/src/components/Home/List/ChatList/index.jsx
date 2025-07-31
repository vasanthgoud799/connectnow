import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import AddUser from "./AddUser";
import { useAppStore } from "@/store";
import { apiClient } from "@/lib/api-client.js";
import { GET_USER_DETAILS_ROUTE } from "@/utils/constants.js";
import { useSocket } from "@/context/SocketContext";
import { GET_LAST_MESSAGE_ROUTE } from "@/utils/constants";

function ChatList() {
  const [useMode, setUseMode] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [clear, setClear] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [friendsDetails, setFriendsDetails] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const { userInfo, setSelectedChatData, friends } = useAppStore();
  const filteredFriendList = userInfo?.friends || [];

  // Filter out friends based on the friends array
  const friendList = useMemo(() => {
    if (!friends || friends.length === 0) return filteredFriendList;
    return filteredFriendList.filter((item) => !friends.includes(item));
  }, [filteredFriendList, friends]);

  // Socket context for real-time messaging
  const  socket  = useSocket();

  // Fetch last messages
  const fetchLastMessages = async (friendList, currentUserId) => {
    try {
      const response = await apiClient.post(GET_LAST_MESSAGE_ROUTE, {
        userIds: friendList,
        currentUserId: currentUserId,
      });
      return response.data.lastMessages;
    } catch (error) {
      console.error("Error fetching last messages:", error);
      return [];
    }
  };

  const fetchLastMessage=async()=>{
      return await fetchLastMessages(friendList, userInfo.id);
  }
  // Fetch friends details
  const fetchFriendsDetails = useCallback(async () => {
    if (friendList.length === 0) {
      setFriendsDetails([]);
      return;
    }
    setIsLoading(true);
    try {
      // Fetch user details first
      const userDetailsResponse = await apiClient.post(GET_USER_DETAILS_ROUTE, {
        userIds: friendList,
        currentUserId: userInfo.id,
      });

      const userDetails = userDetailsResponse.data.users || [];

      // Fetch last messages separately
      
      const lastMessages = await fetchLastMessage();

      // Merge user details with last messages
      const combinedDetails = userDetails.map((user) => {
        const lastMessageData = lastMessages.find(
          (msg) => msg.friendId === user._id
        );
        return {
          ...user,
          lastMessage: lastMessageData ? lastMessageData.lastMessage : "",
          lastMessageTimestamp: lastMessageData
            ? lastMessageData.lastMessageTimestamp
            : null,
        };
      });

      setFriendsDetails(combinedDetails);
    } catch (error) {
      console.error("Error fetching friends' details:", error);
      setFriendsDetails([]);
    } finally {
      setIsLoading(false);
    }
  }, [friendList, userInfo]);

  useEffect(() => {
    if (userInfo && Array.isArray(friendList)) {
      fetchFriendsDetails();
    }
  }, [friendList, userInfo]);

  // Handle real-time message updates
  useEffect(() => {
  if (socket) {
    socket.on("receiveMessage", (messageData) => {
      console.log(messageData)
      fetchFriendsDetails();
      setFriendsDetails((prevFriends) =>
        prevFriends.map((friend) =>
          friend._id === messageData.sender || friend._id === messageData.recipient
            ? {
                ...friend,
                lastMessage: messageData.content,
                lastMessageTimestamp: messageData.timestamp,
              }
            : friend
        )
      );
    });

    return () => {
      socket.off("receiveMessage");
    };
  }
}, [socket]);


  // Re-sort friendsDetails each time it is updated
  useEffect(() => {
    setFriendsDetails((prevFriends) =>
      prevFriends.sort((a, b) => {
        const timeA = a.lastMessageTimestamp
          ? new Date(a.lastMessageTimestamp).getTime()
          : 0;
        const timeB = b.lastMessageTimestamp
          ? new Date(b.lastMessageTimestamp).getTime()
          : 0;
        return timeB - timeA; // Sort in descending order based on last message timestamp
      })
    );
  }, [friendsDetails]);

  // Memoized filtered friends based on search text
  const filteredFriends = useMemo(() => {
    if (!searchText) return friendsDetails;
    return friendsDetails.filter((friend) =>
      `${friend.firstName} ${friend.lastName}`
        .toLowerCase()
        .includes(searchText.toLowerCase())
    );
  }, [searchText, friendsDetails]);

  const addFriendToList = useCallback(() => {
    fetchFriendsDetails(); // Re-fetch the updated friend list after a friend is added
  }, [fetchFriendsDetails, friendList]);

  const selectNewContact = (friend) => {
    setSelectedChatData(friend);
  };

  const handleInput = (e) => {
    const inputValue = e.target.value;
    setSearchText(inputValue);
    setClear(inputValue.trim() !== "");
  };

  const handleClear = () => {
    setSearchText("");
    setClear(false);
  };

  const handleToggleAddUser = () => {
    setShowAddUser((prev) => !prev);
    setUseMode((prev) => !prev);
  };

  return (
    <div className="relative flex-1 overflow-y-auto overflow-scroll scrollbar-hide">
      <div className="search flex items-center gap-2 p-2">
        <div className="searchBar flex flex-1 items-center rounded-3 bg-slate-700">
          <img src="/search.png" alt="search icon" className="w-5 h-5 ml-1" />
          <Input
            placeholder="Search.."
            className="bg-transparent text-white border-0 focus:outline-none flex-1"
            value={searchText}
            onChange={handleInput}
          />
          {clear && (
            <img
              src="/clear.png"
              alt="clear icon"
              className="w-4 h-4 object-contain mr-3 cursor-pointer"
              onClick={handleClear}
            />
          )}
        </div>
        <img
          src={useMode ? "/minus.png" : "/plus.png"}
          alt={useMode ? "minus icon" : "plus icon"}
          className="w-8 h-8 rounded-2 p-2 bg-slate-700 cursor-pointer"
          onClick={handleToggleAddUser}
        />
      </div>

      {isLoading ? (
        <p className="text-center text-gray-500">Loading friends...</p>
      ) : filteredFriends.length === 0 ? (
        <p className="text-center text-gray-500">No friends found</p>
      ) : (
        filteredFriends.map((friend) => (
          <div
            key={friend._id}
            className="flex items-center gap-2 cursor-pointer border-b border-slate-700 p-2 hover:bg-gray-800 rounded-md transition-all duration-200"
            onClick={() => selectNewContact(friend)}
          >
            <img
              src={friend.image || "/avatar.png"}
              alt="avatar"
              className="rounded-full w-[50px] h-[50px] object-cover"
            />
            <div className="flex flex-col flex-grow">
              <div className="flex justify-between items-center">
                <span className="text-white text-lg font-semibold">
                  {friend.firstName} {friend.lastName}
                </span>
                {friend.lastMessageTimestamp && (
                  <span className="text-xs text-gray-300">
                    {new Date(friend.lastMessageTimestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>
              <div className="flex gap-1 items-center">
                <p className="text-sm text-gray-300">
                  {friend.lastMessage || "No messages yet"} {/* Show the last message */}
                </p>
              </div>
            </div>
          </div>
        ))
      )}

      {showAddUser && <AddUser onFriendAdded={addFriendToList} />}
    </div>
  );
}

export default ChatList;
