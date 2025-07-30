export const DASHBOARD_SET_USERNAME = "DASHBOARD.SET_USERNAME";
export const DASHBOARD_SET_IMAGEURL = "DASHBOARD.SET_IMAGEURL";
export const DASHBOARD_SET_ACTIVE_USERS = "DASHBOARD.SET_ACTIVE_USERS";

// Action creators
export const setUsername = (username) => ({
  type: DASHBOARD_SET_USERNAME,
  username,
});

export const setImageUrl = (imageUrl) => ({
  type: DASHBOARD_SET_IMAGEURL,
  imageUrl,
});

export const setActiveUsers = (activeUsers) => ({
  type: DASHBOARD_SET_ACTIVE_USERS,
  activeUsers,
});
