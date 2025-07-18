import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { store, persistor } from "./store/store"; // Ensure the correct path

import App from "./App"; // Main App component
import SocketProvider from "./context/SocketContext";
import { Toaster } from "sonner";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <Provider store={store}>
    <PersistGate loading={null} persistor={persistor}>
      <BrowserRouter>
        <SocketProvider>
          <App />
          <Toaster closeButton />
        </SocketProvider>
      </BrowserRouter>
    </PersistGate>
  </Provider>
);
