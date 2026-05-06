import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Gift, Search, UserPlus } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { LIST_CONTACTS_ROUTE, UPCOMING_BIRTHDAYS_ROUTE } from "@/utils/constants";
import RouteLoader from "@/components/ui/RouteLoader";
import { useAppStore } from "@/store";

const AddUser = lazy(() => import("../List/ChatList/AddUser"));

function ContactsPage({ onOpenChat }) {
  const [contacts, setContacts] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [showAddUser, setShowAddUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [birthdayReminders, setBirthdayReminders] = useState([]);
  const { setSelectedChatData } = useAppStore();

  const loadContacts = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(LIST_CONTACTS_ROUTE, {
        withCredentials: true,
      });
      setContacts(response.data.contacts || []);
    } catch (error) {
      console.error("Error loading contacts:", error);
      setContacts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
    apiClient
      .get(UPCOMING_BIRTHDAYS_ROUTE, { withCredentials: true })
      .then((response) => setBirthdayReminders(response.data.birthdays || []))
      .catch((error) => console.error("Error loading birthdays:", error));
  }, []);

  const birthdayReminderMap = useMemo(
    () =>
      birthdayReminders.reduce((accumulator, birthdayItem) => {
        accumulator[String(birthdayItem._id || birthdayItem.friendId)] =
          birthdayItem.reminder;
        return accumulator;
      }, {}),
    [birthdayReminders]
  );

  const filteredContacts = contacts.filter((contact) =>
    `${contact.firstName || ""} ${contact.lastName || ""} ${contact.email || ""}`
      .toLowerCase()
      .includes(searchText.toLowerCase())
  );
  const loadingPlaceholders = Array.from({ length: 6 }, (_, index) => index);

  return (
    <div className="scrollbar-hide flex min-h-0 flex-1 flex-col overflow-y-auto bg-transparent px-4 pb-24 pt-4 md:overflow-hidden md:px-6 md:pb-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="themed-input flex flex-1 items-center rounded-[22px] px-4 py-3 border border-violet-900">
          <Search className="themed-subtitle h-4 w-4" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search contacts"
            className="themed-title themed-subtitle ml-3 flex-1 bg-transparent outline-none"
          />
        </div>
        <button
          type="button"
          className="themed-panel-soft flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm transition hover:opacity-90 sm:min-w-[152px]"
          onClick={() => setShowAddUser(true)}
        >
          <UserPlus className="h-4 w-4" />
          Add contact
        </button>
      </div>

      <div className="grid auto-rows-min gap-4 pb-2 pr-1 md:min-h-0 md:flex-1 md:overflow-y-auto md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {loading ? (
          <>
            <div className="md:col-span-2 xl:col-span-3 2xl:col-span-4">
              <div className="themed-panel-soft rounded-[24px] px-5 py-4 text-center">
                <p className="themed-title font-['Space_Grotesk'] text-lg font-semibold">
                  Loading contacts...
                </p>
                <p className="themed-subtitle mt-1 text-sm">
                  Pulling your secure contact list and presence details.
                </p>
              </div>
            </div>
            {loadingPlaceholders.map((placeholder) => (
              <div
                key={placeholder}
                className="themed-conversation-card animate-pulse rounded-[24px] p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-white/10" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-32 rounded-full bg-white/10" />
                    <div className="h-3 w-40 rounded-full bg-white/5" />
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="h-3 w-24 rounded-full bg-white/10" />
                  <div className="h-6 w-20 rounded-full bg-white/5" />
                </div>
              </div>
            ))}
          </>
        ) : filteredContacts.length === 0 ? (
          <div className="themed-panel-soft themed-subtitle rounded-[24px] border-dashed p-5">
            No contacts found.
          </div>
        ) : (
          filteredContacts.map((contact) => {
            const reminder = birthdayReminderMap[String(contact._id)];

            return (
            <button
              key={contact._id}
              type="button"
              onClick={() => {
                setSelectedChatData(contact);
                requestAnimationFrame(() => {
                  onOpenChat?.();
                });
              }}
              className="themed-conversation-card rounded-[24px] p-4 text-left transition min-w-0"
            >
              <div className="flex items-center gap-3">
                <img
                  src={contact.image || "/avatar.png"}
                  alt="contact avatar"
                  className="themed-glow-avatar h-12 w-12 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="themed-title truncate text-[1rem] font-semibold">
                    {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email}
                  </p>
                  <p className="themed-subtitle mt-0.5 truncate text-sm">{contact.email}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-col items-start gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className={`truncate ${contact.status === "Online" ? "text-emerald-300" : "text-slate-500"}`}>
                  {contact.status === "Online"
                    ? "Online now"
                    : contact.lastSeen
                      ? `Last seen ${new Date(contact.lastSeen).toLocaleString()}`
                      : "Offline"}
                </span>
                {reminder && (
                  <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200">
                    <Gift className="h-3.5 w-3.5" />
                    {reminder.daysUntilBirthday === 0
                      ? "Birthday today"
                      : `${reminder.daysUntilBirthday} day${reminder.daysUntilBirthday === 1 ? "" : "s"}`}
                  </span>
                )}
              </div>
            </button>
          )})
        )}
      </div>

      {showAddUser && (
        <Suspense fallback={<RouteLoader message="Loading contacts..." />}>
          <AddUser
            onFriendAdded={() => {
              loadContacts();
              setShowAddUser(false);
            }}
            onClose={() => setShowAddUser(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

export default ContactsPage;
