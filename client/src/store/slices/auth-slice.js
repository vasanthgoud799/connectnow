export const createAuthSlice = (set) => ({
  userInfo: undefined,
  isOTPVerified: false,
  setUserInfo: (userInfo) => set({ userInfo }),
  setOTPVerified: (status) => set({ isOTPVerified: status }),
});
