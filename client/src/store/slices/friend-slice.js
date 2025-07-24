// src/store/slices/friend-slice.js

export const createFriendSlice = (set, get) => ({
  friends: [],
  setFriends: (friend) =>
    set((state) => ({
      friends: [...state.friends, friend],
    })),
  addFriend: (friend) =>
    set((state) => ({
      friends: [...state.friends, friend],
    })),
  removeFriend: (friendId) =>
    set((state) => ({
      friends: state.friends.filter((friend) => friend._id !== friendId),
    })),
});
