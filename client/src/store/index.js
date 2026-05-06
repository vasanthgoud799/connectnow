// src/store/index.js

import { create } from "zustand";
import { createAuthSlice } from "./slices/auth-slice";
import { createChatSlice } from "./slices/chat-slice";
import { createDataSlice } from "./slices/data-slice";
import { createFriendSlice } from "./slices/friend-slice";
export const useAppStore = create((set, get) => ({
  ...createAuthSlice(set),
  ...createChatSlice(set, get),
  ...createDataSlice(set, get),
  ...createFriendSlice(set),
}));
