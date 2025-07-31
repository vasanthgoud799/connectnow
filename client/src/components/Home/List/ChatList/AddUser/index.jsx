// src/components/Home/List/ChatList/AddUser.jsx
import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client.js";
import { SEARCH_CONTACTS_ROUTES, ADD_FRIEND_ROUTE } from "@/utils/constants.js";
import { useAppStore } from "@/store";

function AddUser({ onFriendAdded }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchedContacts, setSearchedContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { userInfo, setUserInfo } = useAppStore();

  const searchContacts = async () => {
    if (searchTerm.length === 0) return;

    setLoading(true);
    setError("");

    try {
      const response = await apiClient.post(
        SEARCH_CONTACTS_ROUTES,
        { searchTerm },
        { withCredentials: true }
      );

      if (response.status === 200 && response.data.contacts) {
        setSearchedContacts(response.data.contacts);
      } else {
        setSearchedContacts([]);
        setError("No users found");
      }
    } catch (err) {
      console.error("Search error:", err);
      setError("An error occurred while searching.");
    } finally {
      setLoading(false);
    }
  };

  const addFriend = async (contactId) => {
    setLoading(true);
    setError("");

    try {
      const response = await apiClient.post(
        ADD_FRIEND_ROUTE,
        { contactId },
        { withCredentials: true }
      );

      if (response.status === 200) {
        // Update the global state `userInfo` with the new friend
        const updatedFriends = [...userInfo.friends, contactId];
        setUserInfo({
          ...userInfo,
          friends: updatedFriends,
        });

        // Notify parent (ChatList) that a friend has been added
        onFriendAdded(contactId);
        setSearchedContacts((prevContacts) =>
          prevContacts.filter((contact) => contact._id !== contactId)
        );
        console.log("Friend added successfully");
      } else {
        setError(`Failed to add friend: ${response.statusText}`);
      }
    } catch (err) {
      console.error("Error adding friend:", err);
      setError("An error occurred while adding the friend.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed flex flex-col top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gray-800 p-4 rounded-lg h-[500px] shadow-lg z-50">
      <div className="searchBar flex items-center rounded-3 bg-slate-700 mb-4">
        <img src="/search.png" alt="search icon" className="w-5 h-5 ml-1" />
        <Input
          placeholder="Username"
          className="bg-transparent text-white border-0 focus:outline-none flex-1"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Button onClick={searchContacts} disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </Button>
      </div>

      <div className="users flex space-y-2 flex-col overflow-auto">
        {searchedContacts.length > 0 ? (
          searchedContacts.map((contact) => (
            <div key={contact._id} className="flex items-center justify-between p-2 bg-slate-600 rounded-md">
              <div className="flex items-center">
                <img
                  src={contact.image || "/default-avatar.png"}
                  alt="user avatar"
                  className="w-10 h-10 rounded-full object-contain"
                />
                <div className="flex flex-col ml-2">
                  <span className="text-white">
                    {contact.firstName && contact.lastName
                      ? `${contact.firstName} ${contact.lastName}`
                      : contact.email}
                  </span>
                  <span className="text-white text-xs">{contact.email}</span>
                </div>
              </div>
              <Button onClick={() => addFriend(contact._id)} disabled={loading}>
                {loading ? "Adding..." : "Add"}
              </Button>
            </div>
          ))
        ) : (
          <div className="text-white text-center">{error || "No users found."}</div>
        )}
      </div>
    </div>
  );
}

export default AddUser;
