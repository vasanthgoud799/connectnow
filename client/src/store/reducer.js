import { combineReducers } from "redux";
import dashboardReducer from "./reducers/dashboardReducer";
import callReducer from "./reducers/callReducer";

// Combine reducers into a rootReducer
const rootReducer = combineReducers({
  Home: dashboardReducer, // Reducer managing dashboard-related state
  call: callReducer, // Reducer managing call-related state
});

export default rootReducer;
