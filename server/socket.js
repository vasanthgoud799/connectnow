import { Server as SocketIOServer } from "socket.io";
import Message from "./models/MessagesModel.js";
import Chat from "./models/ChatModel.js";
import schedule from "node-schedule";

const setupSocket = (server) => {
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.ORIGIN, // Ensure this is correctly set
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  const userSocketMap = new Map();

  const disconnect = (socket) => {
    console.log(`Client disconnected: ${socket.id}`);
    for (const [userId, socketId] of userSocketMap.entries()) {
      if (socketId === socket.id) {
        userSocketMap.delete(userId);
        console.log(
          `User ${userId} disconnected and removed from userSocketMap`
        );
        break;
      }
    }
  };

  const sendMessage = async (message) => {
    const senderSocketId = userSocketMap.get(message.sender);
    const recipientSocketId = userSocketMap.get(message.recipient);

    if (senderSocketId) {
      io.to(senderSocketId).emit("receiveMessage", message);
      console.log(`Message echoed back to sender ${message.sender}`);
    }

    try {
      // Save the message to the database
      const createdMessage = await Message.create({
        sender: message.sender,
        recipient: message.recipient,
        content: message.content,
        messageType: message.messageType,
        fileUrl: message.fileUrl,
        timestamp: message.timestamp,
      });

      const messageData = await Message.findById(createdMessage.id)
        .populate("sender", "id email firstName lastName image")
        .populate("recipient", "id email firstName lastName image");

      // Emit the message to the recipient
      if (recipientSocketId) {
        io.to(recipientSocketId).emit("receiveMessage", messageData);
        console.log(`Message sent to recipient ${message.recipient}`);
      }

      // Update or create chat record
      let chat = await Chat.findOne({
        sender: message.sender,
        recipient: message.recipient,
      });

      if (!chat) {
        chat = await Chat.findOne({
          sender: message.recipient,
          recipient: message.sender,
        });
      }

      if (chat) {
        chat.message = message.content;
        chat.timestamp = message.timestamp;
        await chat.save();
      } else {
        await Chat.create({
          sender: message.sender,
          recipient: message.recipient,
          message: message.content,
          timestamp: message.timestamp,
        });
      }
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  const initiateCall = (caller, callerId, recipientId) => {
    const recipientSocketId = userSocketMap.get(recipientId);
    // console.log("Helo" + recipientSocketId);
    if (recipientSocketId) {
      // const callId = `call-${Date.now()}`; // Create a unique call ID
      io.to(recipientSocketId).emit("incoming-call", {
        caller,
        callerId,
      });
      console.log(`Incoming call from ${callerId} to ${recipientId}`);
    } else {
      console.log(`User ${recipientId} is not connected`);
    }
  };
  const scheduledJobs = {};

  io.on("connection", (socket) => {
    const userId = socket.handshake.query.userId;

    if (userId) {
      userSocketMap.set(userId, socket.id);
      console.log(`User connected: ${userId} with socket ID: ${socket.id}`);
    } else {
      console.log("User ID not provided during connection");
    }

    socket.on("schedule-birthday-message", (data, callback) => {
      console.log(data);
      const { friendId, friendName, date, time, message } = data;

      if (!friendId || !date || !time || !message) {
        return callback({ error: "Invalid data" });
      }

      try {
        const [hours, minutes] = time.split(":").map(Number);
        const scheduleDate = new Date(date);
        scheduleDate.setHours(hours, minutes, 0, 0);

        if (scheduleDate < new Date()) {
          return callback({ error: "Scheduled time must be in the future." });
        }

        // Schedule the job
        const job = schedule.scheduleJob(scheduleDate, () => {
          console.log(`Sending birthday message to ${friendName}: ${message}`);
          io.to(socket.id).emit("birthday-message", {
            friendId,
            friendName,
            message,
          });
        });

        // Store the job for reference
        scheduledJobs[friendId] = job;
        console.log(scheduledJobs);

        callback({ success: true });
      } catch (err) {
        console.error("Error scheduling job:", err);
        callback({ error: "An error occurred while scheduling the message." });
      }
    });

    // Message handler
    socket.on("sendMessage", (message) => {
      console.log("Message received from client:", message);
      sendMessage(message);
    });

    // Call initiation handler
    socket.on("initiateCall", ({ caller, callerId, recipientId }) => {
      console.log(`Call initiation request from ${callerId} to ${recipientId}`);
      initiateCall(caller, callerId, recipientId);
    });

    // Handle call acceptance or rejection
    socket.on("call-response", ({ to, accepted }) => {
      const recipientSocketId = userSocketMap.get(to);
      console.log(recipientSocketId);
      io.to(recipientSocketId).emit("call-res", { accepted });
      console.log(`Call ${accepted ? "accepted" : "rejected"} by user ${to}`);
    });

    // Disconnect handler
    socket.on("disconnect", () => disconnect(socket));
  });
};

export default setupSocket;
