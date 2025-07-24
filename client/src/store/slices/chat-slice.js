// src/store/createChatSlice.js

export const createChatSlice = (set, get) => ({
  selectedChatData: undefined,
  setSelectedChatData: (selectedChatData) => set({ selectedChatData }),
  selectedChatMessages: [],
  setSelectedChatMessages: (selectedChatMessages) =>
    set({ selectedChatMessages }),
  addMessages: (message) => {
    const { selectedChatData, selectedChatMessages } = get();

    // Extract recipient and sender IDs, handling both string and object formats
    const recipientId =
      typeof message.recipient === "string"
        ? message.recipient
        : message.recipient?._id || message.recipient.id;

    const senderId =
      typeof message.sender === "string"
        ? message.sender
        : message.sender?._id || message.sender.id;

    // Check if the message belongs to the selected chat
    if (
      recipientId === selectedChatData?._id ||
      senderId === selectedChatData?._id
    ) {
      // Determine the unique message ID (preferably server-generated _id)
      const messageId = message._id || message.id;

      // Prevent adding duplicate messages
      const exists = selectedChatMessages.some(
        (msg) => msg._id === messageId || msg.id === messageId
      );

      if (!exists) {
        set({
          selectedChatMessages: [
            ...selectedChatMessages,
            {
              ...message,
              recipient: recipientId, // Normalize to ID
              sender: senderId, // Normalize to ID
              id: messageId, // Ensure consistent ID field
            },
          ],
        });
      } else {
        console.log("Duplicate message detected, not adding:", message);
      }
    } else {
      console.log("Message does not belong to selected chat:", message);
    }
  },
});
