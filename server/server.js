import express from "express";
import { Server } from "socket.io";
import { ExpressPeerServer } from "peer";
import { v4 as uuidv4 } from "uuid";
const PORT = 5000;

const app = express();

const server = app.listen(PORT, () => {
  console.log(`server is listening on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
});

const peerServer = ExpressPeerServer(server, {
  debug: true,
});

console.log("hello");
app.use("/peerjs", peerServer);

// Remove the group call handler import since it's no longer needed
// const groupCallHandler = require('./groupCallHandler');
// groupCallHandler.createPeerServerListeners(peerServer);

let peers = [];
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const broadcastEventTypes = {
  ACTIVE_USERS: "ACTIVE_USERS",
};

io.on("connection", (socket) => {
  socket.emit("connection", null);
  console.log("new user connected");
  console.log(socket.id);

  // Listen for 'get-active-users' event after page reload
  socket.on("get-active-users", () => {
    console.log("getActiveUsers");
    // Send the active users list to the client
    socket.emit("broadcast", {
      event: broadcastEventTypes.ACTIVE_USERS,
      activeUsers: peers,
      message: "for refresh",
    });
  });

  socket.on("register-new-user", (data) => {
    // Check if user already exists
    const existingUser = peers.find((user) => user.username === data.username);
    if (!existingUser) {
      console.log(data);
      peers.push({
        username: data.username,
        socketId: socket.id,
      });
    }

    console.log("registered new user");
    console.log(peers);

    io.sockets.emit("broadcast", {
      event: broadcastEventTypes.ACTIVE_USERS,
      activeUsers: peers,
      message: "for registering",
    });
  });

  socket.on("disconnect", () => {
    console.log("user disconnected");
    peers = peers.filter((peer) => peer.socketId !== socket.id);
    // io.sockets.emit("broadcast", {
    //   event: broadcastEventTypes.ACTIVE_USERS,
    //   activeUsers: peers,
    //   message: "for disconnection",
    // });
  });

  // listeners related with direct call
  socket.on("pre-offer", (data) => {
    console.log("pre-offer handled");
    io.to(data.callee.socketId).emit("pre-offer", {
      callerUsername: data.caller.username,
      callerImage: data.caller.imageUrl,
      callerSocketId: socket.id,
    });
  });

  socket.on("pre-offer-answer", (data) => {
    console.log("handling pre offer answer");
    io.to(data.callerSocketId).emit("pre-offer-answer", {
      answer: data.answer,
    });
  });

  socket.on("webRTC-offer", (data) => {
    console.log("handling webRTC offer");
    io.to(data.calleeSocketId).emit("webRTC-offer", {
      offer: data.offer,
    });
  });

  socket.on("webRTC-answer", (data) => {
    console.log("handling webRTC answer");
    io.to(data.callerSocketId).emit("webRTC-answer", {
      answer: data.answer,
    });
  });

  socket.on("webRTC-candidate", (data) => {
    console.log("handling ice candidate");
    io.to(data.connectedUserSocketId).emit("webRTC-candidate", {
      candidate: data.candidate,
    });
  });

  socket.on("user-hanged-up", (data) => {
    io.to(data.connectedUserSocketId).emit("user-hanged-up");
  });
});
