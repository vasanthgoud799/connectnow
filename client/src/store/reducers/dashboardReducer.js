import * as dashboardActions from "../actions/dashboardActions";

// Initial state with activeUsers set as an empty array
const initState = {
  username: "",
  imageUrl: "",
  activeUsers: [],
  groupCallRooms: [],
};

const dashboardReducer = (state = initState, action) => {
  // console.log("Current state in reducer:", state);
  switch (action.type) {
    case dashboardActions.DASHBOARD_SET_USERNAME:
      return {
        ...state,
        username: action.username,
      };
    case dashboardActions.DASHBOARD_SET_IMAGEURL:
      return {
        ...state,
        imageUrl: action.imageUrl,
      };
    case dashboardActions.DASHBOARD_SET_ACTIVE_USERS:
      return {
        ...state,
        activeUsers: action.activeUsers || [] || action.payload, // Ensure activeUsers is an array
      };
    default:
      return state;
  }
};

export default dashboardReducer;
