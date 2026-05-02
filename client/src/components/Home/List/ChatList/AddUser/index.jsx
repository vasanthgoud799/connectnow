import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client.js";
import { SEARCH_CONTACTS_ROUTES, SEND_FRIEND_REQUEST_ROUTE } from "@/utils/constants.js";
import { useAppStore } from "@/store";
import { Search, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

function AddUser({ onFriendAdded, onClose }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchedContacts, setSearchedContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { userInfo, setUserInfo } = useAppStore();

  const searchContacts = async () => {
    if (!searchTerm.trim()) {
      setError("Enter a name or email to search.");
      setSearchedContacts([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await apiClient.post(
        SEARCH_CONTACTS_ROUTES,
        { searchTerm: searchTerm.trim() },
        { withCredentials: true }
      );

      if (response.status === 200) {
        const contacts = response.data.contacts || [];
        setSearchedContacts(contacts);
        if (!contacts.length) {
          setError("No matching users found.");
        }
      }
    } catch (err) {
      console.error("Search error:", err);
      setError("Could not search users right now.");
    } finally {
      setLoading(false);
    }
  };

  const sendFriendRequest = async (contactId) => {
    setLoading(true);
    setError("");

    try {
      const response = await apiClient.post(
        SEND_FRIEND_REQUEST_ROUTE,
        { receiverId: contactId },
        { withCredentials: true }
      );

      if (response.status === 200 || response.status === 201) {
        setUserInfo({
          ...userInfo,
          sentRequests: [...new Set([...(userInfo?.sentRequests || []), contactId])],
        });

        setSearchedContacts((prevContacts) =>
          prevContacts.map((contact) =>
            contact._id === contactId
              ? { ...contact, relationStatus: "requested" }
              : contact
          )
        );
        toast.success("Request sent");
      }
    } catch (err) {
      console.error("Error sending friend request:", err);
      setError(err.response?.data?.message || "Could not send this request.");
      toast.error("Failed to send request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="themed-modal-surface flex max-h-[min(86vh,760px)] w-full max-w-3xl flex-col overflow-hidden rounded-[32px] shadow-[0_30px_80px_rgba(2,8,23,0.25)]">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="themed-accent-text text-xs uppercase tracking-[0.28em]">
              New contact
            </p>
            <h3 className="themed-title mt-2 font-['Space_Grotesk'] text-2xl font-semibold">
              Add a friend
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="themed-panel-soft rounded-full p-2 transition hover:opacity-90"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="themed-subtitle pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder="Search by name or email"
                className="themed-input h-12 rounded-2xl pl-11"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    searchContacts();
                  }
                }}
              />
            </div>
            <Button
              onClick={searchContacts}
              disabled={loading}
              className="h-12 rounded-2xl bg-gradient-to-r from-[#f97316] to-[#38bdf8] px-6 text-white"
            >
              {loading ? "Searching..." : "Search"}
            </Button>
          </div>

          <div className="mt-6 min-h-[280px] max-h-[420px] space-y-3 overflow-y-auto pr-2">
            {searchedContacts.length > 0 ? (
              searchedContacts.map((contact) => (
                <div
                  key={contact._id}
                  className="themed-page-card grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-[24px] p-4"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <img
                      src={contact.image || "/avatar.png"}
                      alt="user avatar"
                      className="h-12 w-12 rounded-2xl object-cover"
                    />
                    <div className="min-w-0">
                      <p className="themed-title font-medium">
                        {contact.firstName && contact.lastName
                          ? `${contact.firstName} ${contact.lastName}`
                          : contact.email}
                      </p>
                      <p className="themed-subtitle truncate text-sm">{contact.email}</p>
                    </div>
                  </div>
                  {contact.relationStatus === "friends" ? (
                    <Button
                      disabled
                      className="h-11 min-w-[132px] rounded-2xl bg-emerald-500/15 px-5 text-emerald-200 hover:bg-emerald-500/15"
                    >
                      Friends
                    </Button>
                  ) : contact.relationStatus === "requested" ? (
                    <Button
                      disabled
                      className="h-11 min-w-[132px] rounded-2xl bg-slate-200 px-5 text-slate-600 hover:bg-slate-200"
                    >
                      Requested
                    </Button>
                  ) : contact.relationStatus === "incoming_request" ? (
                    <Button
                      disabled
                      className="h-11 min-w-[132px] rounded-2xl bg-amber-500/15 px-5 text-amber-200 hover:bg-amber-500/15"
                    >
                      Check requests
                    </Button>
                  ) : (
                    <Button
                      onClick={() => sendFriendRequest(contact._id)}
                      disabled={loading}
                      className="h-11 min-w-[152px] rounded-2xl bg-white px-5 text-slate-950 hover:bg-slate-100"
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      Add Friend
                    </Button>
                  )}
                </div>
              ))
            ) : (
              <div className="themed-page-card themed-subtitle flex h-[280px] items-center justify-center rounded-[24px] border-dashed px-6 text-center">
                {error || "Search for people to start chatting."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AddUser;
