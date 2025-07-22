// src/hooks/useHandleReceiveMessage.js
import { useEffect } from "react";
import { useAppStore } from "@/store";

const useHandleReceiveMessage = (socket) => {
  const { addMessages } = useAppStore();

  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (message) => {
      console.log("Message received via socket:", message); // Debugging
      addMessages(message);
    };

    socket.on("receiveMessage", handleReceiveMessage);

    return () => {
      socket.off("receiveMessage", handleReceiveMessage);
    };
  }, [socket, addMessages]);
};

export default useHandleReceiveMessage;
