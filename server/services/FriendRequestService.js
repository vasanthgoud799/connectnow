import FriendRequest from "../models/FriendRequestModel.js";
import User from "../models/UserModel.js";

const getNormalizedId = (value) => String(value?._id || value?.id || value);

const populateRequest = (query) =>
  query
    .populate("senderId", "id email firstName lastName image status lastSeen")
    .populate("receiverId", "id email firstName lastName image status lastSeen");

export const areUsersFriends = async (userA, userB) => {
  const user = await User.findById(userA).select("friends");
  if (!user) return false;

  return (user.friends || []).some((friendId) => String(friendId) === String(userB));
};

export const sendFriendRequest = async ({ senderId, receiverId }) => {
  if (!senderId || !receiverId) {
    throw new Error("senderId and receiverId are required");
  }

  if (String(senderId) === String(receiverId)) {
    throw new Error("You cannot send a friend request to yourself");
  }

  const [sender, receiver] = await Promise.all([
    User.findById(senderId).select("friends blockedUsers sentRequests receivedRequests"),
    User.findById(receiverId).select("friends blockedUsers sentRequests receivedRequests"),
  ]);

  if (!sender || !receiver) {
    throw new Error("User not found");
  }

  if ((sender.friends || []).some((friendId) => String(friendId) === String(receiverId))) {
    throw new Error("You are already friends");
  }

  if ((sender.blockedUsers || []).some((userId) => String(userId) === String(receiverId))) {
    throw new Error("Unblock this user before sending a request");
  }

  if ((receiver.blockedUsers || []).some((userId) => String(userId) === String(senderId))) {
    throw new Error("You cannot send a request to this user");
  }

  const existingPending = await populateRequest(
    FriendRequest.findOne({
      $or: [
        { senderId, receiverId, status: "pending" },
        { senderId: receiverId, receiverId: senderId, status: "pending" },
      ],
    })
  );

  if (existingPending) {
    if (String(existingPending.senderId?._id || existingPending.senderId) === String(senderId)) {
      throw new Error("Friend request already sent");
    }

    throw new Error("This user has already sent you a friend request");
  }

  let request = await FriendRequest.create({
    senderId,
    receiverId,
    status: "pending",
  });

  await Promise.all([
    User.findByIdAndUpdate(senderId, {
      $addToSet: { sentRequests: receiverId },
    }),
    User.findByIdAndUpdate(receiverId, {
      $addToSet: { receivedRequests: senderId },
    }),
  ]);

  request = await populateRequest(FriendRequest.findById(request._id));
  return request;
};

export const acceptFriendRequest = async ({ requestId, userId }) => {
  let request = await FriendRequest.findOne({
    _id: requestId,
    receiverId: userId,
    status: "pending",
  });

  if (!request) {
    throw new Error("Friend request not found");
  }

  request.status = "accepted";
  request.respondedAt = new Date();
  await request.save();

  await Promise.all([
    User.findByIdAndUpdate(request.senderId, {
      $addToSet: { friends: request.receiverId },
      $pull: { sentRequests: request.receiverId, receivedRequests: request.receiverId },
    }),
    User.findByIdAndUpdate(request.receiverId, {
      $addToSet: { friends: request.senderId },
      $pull: { receivedRequests: request.senderId, sentRequests: request.senderId },
    }),
  ]);

  request = await populateRequest(FriendRequest.findById(request._id));
  return request;
};

export const rejectFriendRequest = async ({ requestId, userId }) => {
  let request = await FriendRequest.findOne({
    _id: requestId,
    receiverId: userId,
    status: "pending",
  });

  if (!request) {
    throw new Error("Friend request not found");
  }

  request.status = "rejected";
  request.respondedAt = new Date();
  await request.save();

  await Promise.all([
    User.findByIdAndUpdate(request.senderId, {
      $pull: { sentRequests: request.receiverId, receivedRequests: request.receiverId },
    }),
    User.findByIdAndUpdate(request.receiverId, {
      $pull: { receivedRequests: request.senderId, sentRequests: request.senderId },
    }),
  ]);

  request = await populateRequest(FriendRequest.findById(request._id));
  return request;
};

export const cancelFriendRequest = async ({ requestId, userId }) => {
  const request = await FriendRequest.findOne({
    _id: requestId,
    senderId: userId,
    status: "pending",
  });

  if (!request) {
    throw new Error("Friend request not found");
  }

  request.status = "cancelled";
  request.respondedAt = new Date();
  await request.save();

  await Promise.all([
    User.findByIdAndUpdate(request.senderId, {
      $pull: { sentRequests: request.receiverId },
    }),
    User.findByIdAndUpdate(request.receiverId, {
      $pull: { receivedRequests: request.senderId },
    }),
  ]);

  return request;
};

export const listPendingRequestsForUser = async ({ userId }) => {
  return populateRequest(
    FriendRequest.find({
      receiverId: userId,
      status: "pending",
    }).sort({ createdAt: -1 })
  );
};

export const listFriendsForUser = async ({ userId }) => {
  const user = await User.findById(userId)
    .select("friends")
    .populate("friends", "id email firstName lastName image status lastSeen");

  return user?.friends || [];
};

export const getRelationshipStatusMap = async ({ currentUserId, targetIds = [] }) => {
  const currentUser = await User.findById(currentUserId).select(
    "friends sentRequests receivedRequests"
  );

  const friendIds = new Set((currentUser?.friends || []).map(getNormalizedId));
  const sentRequestIds = new Set((currentUser?.sentRequests || []).map(getNormalizedId));
  const receivedRequestIds = new Set((currentUser?.receivedRequests || []).map(getNormalizedId));

  return targetIds.reduce((acc, targetId) => {
    const normalizedId = String(targetId);
    if (friendIds.has(normalizedId)) {
      acc[normalizedId] = "friends";
    } else if (sentRequestIds.has(normalizedId)) {
      acc[normalizedId] = "requested";
    } else if (receivedRequestIds.has(normalizedId)) {
      acc[normalizedId] = "incoming_request";
    } else {
      acc[normalizedId] = "none";
    }

    return acc;
  }, {});
};
