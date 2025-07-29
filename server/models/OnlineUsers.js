import mongoose from "mongoose";

const onlineUsersSchema = new mongoose.Schema({
  onlineUsers: [
    {
      username: { type: String, required: true },
      socketId: { type: String, required: true },
    },
  ],
});

const ActiveUser = mongoose.model("ActiveUsers", onlineUsersSchema);

export default ActiveUser;
