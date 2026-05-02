import React, { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useAppStore } from "@/store";
import { HOST } from "@/utils/constants";
import { getStoredAppSessionToken } from "@/lib/api-client";
import {
  connectWithWebSocket,
  disconnectWebSocket,
} from "@/utils/wssConnection/wssConnection";

const SocketContext = createContext(null);

const getCookieValue = (name) => {
  if (typeof document === "undefined") return "";

  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1) || "";
};

export const useSocket = () => {
  return useContext(SocketContext);
};

const SocketProvider = ({ children }) => {
  const { userInfo } = useAppStore();
  const [socket, setSocket] = useState(null);
  const userId = userInfo?.id;

  useEffect(() => {
    if (userId && userInfo) {
      console.log("SocketProvider establishing socket", { userId });
      const nextSocket = io(HOST, {
        withCredentials: true,
        transports: ["websocket", "polling"],
        upgrade: true,
        rememberUpgrade: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500,
        reconnectionDelayMax: 1500,
        auth: {
          csrfToken: decodeURIComponent(getCookieValue("csrf_token")),
          token: getStoredAppSessionToken(),
        },
      });

      setSocket(nextSocket);

      nextSocket.on("connect", () => {
        console.log("Connected to socket server");
      });

      connectWithWebSocket(nextSocket, userInfo);

      return () => {
        console.log("SocketProvider cleanup", {
          userId,
          currentSocketId: nextSocket.id,
        });
        disconnectWebSocket();
        nextSocket.disconnect();
        setSocket(null);
        console.log("Disconnected from socket server");
      };
    }

    if (!userInfo) {
      if (socket) {
        disconnectWebSocket();
        socket.disconnect();
        setSocket(null);
          console.log("Disconnected from socket server");
      }
    }
  }, [userId]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
};

export default SocketProvider;
