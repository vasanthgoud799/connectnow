import { createStore } from "redux";
import { persistStore, persistReducer } from "redux-persist";
import storage from "redux-persist/lib/storage"; // localStorage
import { composeWithDevTools } from "redux-devtools-extension";
import rootReducer from "./reducer"; // Root reducer with nested persist config

// Persist config to specify the storage and whitelist for persistence
const persistConfig = {
  key: "root",
  storage,
  whitelist: ["Home"], // Persist only the 'Home' slice (dashboard-related state)
};

// Create a persisted reducer
const persistedReducer = persistReducer(persistConfig, rootReducer);

// Create the Redux store with dev tools
const store = createStore(persistedReducer, composeWithDevTools());

// Create persistor for Redux persistence
const persistor = persistStore(store);

export { store, persistor };
