import {
  getStoredBrowserNotificationsEnabled,
  setStoredBrowserNotificationsEnabled,
} from "@/utils/browserNotifications";

export const createAuthSlice = (set) => ({
  userInfo: undefined,
  setUserInfo: (userInfo) => set({ userInfo }),
  browserNotificationsEnabled: getStoredBrowserNotificationsEnabled(),
  setBrowserNotificationsEnabled: (enabled) => {
    setStoredBrowserNotificationsEnabled(enabled);
    set({ browserNotificationsEnabled: enabled });
  },
});
