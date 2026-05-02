import { createStore } from "redux";
import { persistStore, persistReducer } from "redux-persist";
import storage from "redux-persist/lib/storage";
import rootReducer from "./reducer";

// Persist config
const persistConfig = {
  key: "root",
  storage,
  whitelist: ["Home"],
};

// Persisted reducer
const persistedReducer = persistReducer(persistConfig, rootReducer);

// Create store (Redux DevTools works automatically in browser)
const store = createStore(
  persistedReducer,
  window.__REDUX_DEVTOOLS_EXTENSION__ && window.__REDUX_DEVTOOLS_EXTENSION__(),
);

// Persistor
const persistor = persistStore(store);

export { store, persistor };
