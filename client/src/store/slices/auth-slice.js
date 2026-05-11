import {
  getStoredBrowserNotificationsEnabled,
  setStoredBrowserNotificationsEnabled,
} from "@/utils/browserNotifications";

const resolveUserImage = (user) =>
  user?.image || user?.avatarUrl || user?.avatar || user?.profileImage || "";

const normalizeUserInfo = (userInfo) => {
  if (!userInfo) return userInfo;

  const image = resolveUserImage(userInfo);
  return {
    ...userInfo,
    image,
    avatar: userInfo.avatar || image,
    avatarUrl: userInfo.avatarUrl || image,
    profileImage: userInfo.profileImage || image,
  };
};

export const createAuthSlice = (set) => ({
  userInfo: undefined,
  setUserInfo: (userInfo) => set({ userInfo: normalizeUserInfo(userInfo) }),
  browserNotificationsEnabled: getStoredBrowserNotificationsEnabled(),
  setBrowserNotificationsEnabled: (enabled) => {
    setStoredBrowserNotificationsEnabled(enabled);
    set({ browserNotificationsEnabled: enabled });
  },
});
