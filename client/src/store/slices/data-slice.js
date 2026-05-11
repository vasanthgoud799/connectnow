import { apiClient } from "@/lib/api-client";
import {
  CALLS_HISTORY_ROUTE,
  GET_CHATS_ROUTE,
  LIST_CONTACTS_ROUTE,
  SECURITY_ADMIN_DASHBOARD_ROUTE,
  SECURITY_EVENTS_ROUTE,
  SECURITY_SESSIONS_ROUTE,
  SECURITY_TRUSTED_DEVICES_ROUTE,
  UPCOMING_BIRTHDAYS_ROUTE,
} from "@/utils/constants";

let chatSummariesRequestId = 0;
let chatSummariesPromise = null;
let contactsPromise = null;
let birthdaysPromise = null;
let callsPromise = null;
let securitySnapshotPromise = null;

export const createDataSlice = (set, get) => ({
  chatSummariesLoaded: false,
  chatSummariesLoading: false,
  contacts: [],
  contactsLoaded: false,
  contactsLoading: false,
  birthdayReminders: [],
  birthdayRemindersLoaded: false,
  birthdayRemindersLoading: false,
  calls: [],
  callsLoaded: false,
  callsLoading: false,
  sessions: [],
  trustedDevices: [],
  securityEvents: [],
  adminDashboard: null,
  securitySnapshotLoaded: false,
  securitySnapshotLoading: false,
  securitySnapshotError: "",
  activeHomeSection: "chats",
  mobileChatView: "chat",

  invalidateChatSummaries: () =>
    set({ chatSummariesLoaded: false, chatSummariesLoading: false }),
  invalidateContacts: () =>
    set({ contactsLoaded: false, contactsLoading: false }),
  invalidateBirthdays: () =>
    set({ birthdayRemindersLoaded: false, birthdayRemindersLoading: false }),
  invalidateCalls: () =>
    set({ callsLoaded: false, callsLoading: false }),
  invalidateSecuritySnapshot: () =>
    set({
      securitySnapshotLoaded: false,
      securitySnapshotLoading: false,
      securitySnapshotError: "",
    }),
  setActiveHomeSection: (activeHomeSection) => set({ activeHomeSection }),
  setMobileChatView: (mobileChatView) => set({ mobileChatView }),
  setSessions: (updater) =>
    set((state) => ({
      sessions: typeof updater === "function" ? updater(state.sessions || []) : updater,
    })),

  fetchChatSummaries: async ({ force = false, currentUserId } = {}) => {
    const state = get();
    if (!force && (state.chatSummariesLoaded || state.chatSummariesLoading)) {
      return state.chatSummaries;
    }
    if (chatSummariesPromise) {
      return chatSummariesPromise;
    }

    const requestId = ++chatSummariesRequestId;
    set({ chatSummariesLoading: true });

    chatSummariesPromise = (async () => {
      try {
        const response = await apiClient.get(GET_CHATS_ROUTE, {
          withCredentials: true,
        });
        const rawChats = Array.isArray(response.data?.chats) ? response.data.chats : [];

        if (requestId === chatSummariesRequestId) {
          set({
            chatSummaries: rawChats,
            chatSummariesLoaded: true,
            chatSummariesLoading: false,
          });
        }

        return rawChats;
      } catch (error) {
        console.error("Error fetching chats:", error);
        if (requestId === chatSummariesRequestId) {
          set({
            chatSummaries: [],
            chatSummariesLoaded: true,
            chatSummariesLoading: false,
          });
        }
        return [];
      } finally {
        if (requestId === chatSummariesRequestId) {
          set({ chatSummariesLoading: false });
        }
        chatSummariesPromise = null;
      }
    })();

    return chatSummariesPromise;
  },

  fetchContacts: async ({ force = false } = {}) => {
    const state = get();
    if (!force && (state.contactsLoaded || state.contactsLoading)) {
      return state.contacts;
    }
    if (contactsPromise) {
      return contactsPromise;
    }

    set({ contactsLoading: true });
    contactsPromise = (async () => {
      try {
        const response = await apiClient.get(LIST_CONTACTS_ROUTE, {
          withCredentials: true,
        });
        const contacts = response.data?.contacts || [];
        set({
          contacts,
          contactsLoaded: true,
          contactsLoading: false,
        });
        return contacts;
      } catch (error) {
        console.error("Error loading contacts:", error);
        set({
          contacts: [],
          contactsLoaded: true,
          contactsLoading: false,
        });
        return [];
      } finally {
        contactsPromise = null;
      }
    })();

    return contactsPromise;
  },

  fetchBirthdayReminders: async ({ force = false } = {}) => {
    const state = get();
    if (!force && (state.birthdayRemindersLoaded || state.birthdayRemindersLoading)) {
      return state.birthdayReminders;
    }
    if (birthdaysPromise) {
      return birthdaysPromise;
    }

    set({ birthdayRemindersLoading: true });
    birthdaysPromise = (async () => {
      try {
        const response = await apiClient.get(UPCOMING_BIRTHDAYS_ROUTE, {
          withCredentials: true,
        });
        const birthdays = response.data?.birthdays || [];
        set({
          birthdayReminders: birthdays,
          birthdayRemindersLoaded: true,
          birthdayRemindersLoading: false,
        });
        return birthdays;
      } catch (error) {
        console.error("Error loading birthdays:", error);
        set({
          birthdayReminders: [],
          birthdayRemindersLoaded: true,
          birthdayRemindersLoading: false,
        });
        return [];
      } finally {
        birthdaysPromise = null;
      }
    })();

    return birthdaysPromise;
  },

  fetchCalls: async ({ force = false } = {}) => {
    const state = get();
    if (!force && (state.callsLoaded || state.callsLoading)) {
      return state.calls;
    }
    if (callsPromise) {
      return callsPromise;
    }

    set({ callsLoading: true });
    callsPromise = (async () => {
      try {
        const response = await apiClient.get(CALLS_HISTORY_ROUTE, {
          withCredentials: true,
        });
        const calls = response.data?.calls || [];
        set({
          calls,
          callsLoaded: true,
          callsLoading: false,
        });
        return calls;
      } catch (error) {
        console.error("Error loading calls:", error);
        set({
          calls: [],
          callsLoaded: true,
          callsLoading: false,
        });
        return [];
      } finally {
        callsPromise = null;
      }
    })();

    return callsPromise;
  },

  fetchSecuritySnapshot: async ({ force = false, isAdmin = false } = {}) => {
    const state = get();
    if (!force && (state.securitySnapshotLoaded || state.securitySnapshotLoading)) {
      return {
        sessions: state.sessions,
        trustedDevices: state.trustedDevices,
        securityEvents: state.securityEvents,
        adminDashboard: state.adminDashboard,
      };
    }
    if (securitySnapshotPromise) {
      return securitySnapshotPromise;
    }

    set({ securitySnapshotLoading: true, securitySnapshotError: "" });
    securitySnapshotPromise = (async () => {
      try {
        const [sessionResponse, eventsResponse, trustedDevicesResponse] = await Promise.all([
          apiClient.get(SECURITY_SESSIONS_ROUTE, { withCredentials: true }),
          apiClient.get(`${SECURITY_EVENTS_ROUTE}?limit=5`, { withCredentials: true }),
          apiClient.get(SECURITY_TRUSTED_DEVICES_ROUTE, { withCredentials: true }),
        ]);

        let adminDashboard = null;
        if (isAdmin) {
          const dashboardResponse = await apiClient.get(
            `${SECURITY_ADMIN_DASHBOARD_ROUTE}?hours=24`,
            { withCredentials: true }
          );
          adminDashboard = dashboardResponse.data || null;
        }

        const snapshot = {
          sessions: sessionResponse.data?.sessions || [],
          trustedDevices: trustedDevicesResponse.data?.devices || [],
          securityEvents: eventsResponse.data?.events || [],
          adminDashboard,
        };

        set({
          ...snapshot,
          securitySnapshotLoaded: true,
          securitySnapshotLoading: false,
          securitySnapshotError: "",
        });

        return snapshot;
      } catch (error) {
        console.error("Error loading security snapshot:", error);
        const emptySnapshot = {
          sessions: [],
          trustedDevices: [],
          securityEvents: [],
          adminDashboard: null,
        };
        set({
          ...emptySnapshot,
          securitySnapshotLoaded: true,
          securitySnapshotLoading: false,
          securitySnapshotError:
            error?.response?.data?.message || "Unable to load active sessions.",
        });
        return emptySnapshot;
      } finally {
        securitySnapshotPromise = null;
      }
    })();

    return securitySnapshotPromise;
  },
});
