// src/store/index.js

import { create } from "zustand";
import { createAuthSlice } from "./slices/auth-slice";
import { createChatSlice } from "./slices/chat-slice";
import { createFriendSlice } from "./slices/friend-slice";
export const useAppStore = create((set, get) => ({
  ...createAuthSlice(set),
  ...createChatSlice(set, get),
  ...createFriendSlice(set),
}));
