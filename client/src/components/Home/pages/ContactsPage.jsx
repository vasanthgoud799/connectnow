import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Gift, Search, UserPlus } from "lucide-react";

import RouteLoader from "@/components/ui/RouteLoader";
import PageScaffold from "@/components/ui/PageScaffold";
import StatePanel from "@/components/ui/StatePanel";
import { useAppStore } from "@/store";

const AddUser = lazy(() => import("../List/ChatList/AddUser"));

function ContactsPage({ onOpenChat }) {
  const [searchText, setSearchText] = useState("");
  const [showAddUser, setShowAddUser] = useState(false);
  const {
    contacts,
    contactsLoaded,
    contactsLoading,
    birthdayReminders,
    fetchContacts,
    fetchBirthdayReminders,
    invalidateContacts,
    invalidateBirthdays,
    setSelectedChatData,
  } = useAppStore();

  useEffect(() => {
    fetchContacts();
    fetchBirthdayReminders();
  }, [fetchBirthdayReminders, fetchContacts]);

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
    <>
      <PageScaffold
        header={
          <div>
            <p className="themed-title font-['Space_Grotesk'] text-2xl font-semibold">
              Your contacts
            </p>
            <p className="themed-subtitle mt-1 text-sm">
              Open a direct conversation, manage friend connections, and keep birthday reminders in view.
            </p>
          </div>
        }
        className="bg-transparent"
        bodyClassName="flex min-h-0 flex-col overflow-hidden"
        footerClassName="hidden"
      >
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
        {!contactsLoaded && contactsLoading ? (
          <>
            <div className="md:col-span-2 xl:col-span-3 2xl:col-span-4">
              <StatePanel
                title="Loading contacts..."
                description="Pulling your secure contact list and presence details."
                className="rounded-[24px]"
              />
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
          <div className="md:col-span-2 xl:col-span-3 2xl:col-span-4">
            <StatePanel
              title={searchText.trim() ? "No contacts found" : "No contacts yet"}
              description={
                searchText.trim()
                  ? "Try a different name or email to find the right person."
                  : "Add a contact to start your first direct conversation."
              }
              dashed
            />
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
      </PageScaffold>

      {showAddUser && (
        <Suspense fallback={<RouteLoader message="Loading contacts..." />}>
            <AddUser
              onFriendAdded={() => {
                invalidateContacts();
                invalidateBirthdays();
                fetchContacts({ force: true });
                fetchBirthdayReminders({ force: true });
                setShowAddUser(false);
              }}
              onClose={() => setShowAddUser(false)}
            />
        </Suspense>
      )}
    </>
  );
}

export default ContactsPage;
