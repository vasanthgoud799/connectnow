import {
  acceptFriendRequest,
  cancelFriendRequest,
  listFriendsForUser,
  listPendingRequestsForUser,
  rejectFriendRequest,
  sendFriendRequest,
} from "../services/FriendRequestService.js";
import {
  createNotification,
  getUnreadNotificationCount,
  updateNotificationMetaByReference,
} from "../services/NotificationService.js";
import { ensureBirthdayReminderScheduleForUser } from "../services/ScheduledMessageService.js";
import { getIO, getUserRoom } from "../socket.js";

const emitNotificationCreated = async (notification) => {
  if (!notification) return;

  const unreadCount = await getUnreadNotificationCount({
    userId: notification.userId,
  });

  const io = getIO();
  io?.to(getUserRoom(String(notification.userId))).emit("notification_created", {
    notification,
    unreadCount,
  });
};

export const createFriendRequest = async (req, res) => {
  try {
    const { receiverId } = req.body;
    const request = await sendFriendRequest({
      senderId: req.userId,
      receiverId,
    });

    const notification = await createNotification({
      userId: receiverId,
      type: "friend_request",
      entityId: String(request._id),
      senderId: req.userId,
      referenceId: String(request._id),
      meta: {
        requestId: String(request._id),
        senderId: String(req.userId),
        senderLabel:
          [request.senderId?.firstName, request.senderId?.lastName]
            .filter(Boolean)
            .join(" ") || request.senderId?.email,
        senderImage: request.senderId?.image || null,
      },
    });

    await emitNotificationCreated(notification);

  const io = getIO();
  io?.to(getUserRoom(String(receiverId))).emit("friend_request_received", {
      request,
      notification,
    });
  io?.to(getUserRoom(String(receiverId))).emit("notification_update");

    return res.status(201).json({
      message: "Friend request sent successfully.",
      request,
      notification,
    });
  } catch (error) {
    console.error("Error sending friend request:", error);
    return res.status(400).json({ message: error.message || "Failed to send friend request." });
  }
};

export const acceptRequest = async (req, res) => {
  try {
    const request = await acceptFriendRequest({
      requestId: req.params.requestId,
      userId: req.userId,
    });

    await updateNotificationMetaByReference({
      userId: req.userId,
      type: "friend_request",
      referenceId: String(request._id),
      metaPatch: {
        requestStatus: "accepted",
        handledAt: new Date().toISOString(),
      },
    });

    const acceptedNotification = await createNotification({
      userId: request.senderId?._id || request.senderId,
      type: "request_accepted",
      entityId: String(request._id),
      senderId: req.userId,
      referenceId: String(request._id),
      meta: {
        requestId: String(request._id),
        senderId: String(req.userId),
        senderLabel:
          [request.receiverId?.firstName, request.receiverId?.lastName]
            .filter(Boolean)
            .join(" ") || request.receiverId?.email,
        senderImage: request.receiverId?.image || null,
      },
    });

    await emitNotificationCreated(acceptedNotification);
    await Promise.all([
      ensureBirthdayReminderScheduleForUser(request.senderId?._id || request.senderId),
      ensureBirthdayReminderScheduleForUser(request.receiverId?._id || request.receiverId),
    ]);

    const io = getIO();
    io?.to(getUserRoom(String(request.senderId?._id || request.senderId))).emit(
      "friend_request_accepted",
      {
        request,
        notification: acceptedNotification,
      }
    );
    io?.to(getUserRoom(String(request.senderId?._id || request.senderId))).emit(
      "notification_update"
    );
    io?.to(getUserRoom(String(request.receiverId?._id || request.receiverId))).emit(
      "friend_request_accepted",
      {
        request,
      }
    );

    return res.status(200).json({
      message: "Friend request accepted.",
      request,
      notification: acceptedNotification,
    });
  } catch (error) {
    console.error("Error accepting friend request:", error);
    return res.status(400).json({ message: error.message || "Failed to accept friend request." });
  }
};

export const rejectRequest = async (req, res) => {
  try {
    const request = await rejectFriendRequest({
      requestId: req.params.requestId,
      userId: req.userId,
    });

    await updateNotificationMetaByReference({
      userId: req.userId,
      type: "friend_request",
      referenceId: String(request._id),
      metaPatch: {
        requestStatus: "rejected",
        handledAt: new Date().toISOString(),
      },
    });

    return res.status(200).json({
      message: "Friend request rejected.",
      request,
    });
  } catch (error) {
    console.error("Error rejecting friend request:", error);
    return res.status(400).json({ message: error.message || "Failed to reject friend request." });
  }
};

export const cancelRequest = async (req, res) => {
  try {
    const request = await cancelFriendRequest({
      requestId: req.params.requestId,
      userId: req.userId,
    });

    return res.status(200).json({
      message: "Friend request cancelled.",
      request,
    });
  } catch (error) {
    console.error("Error cancelling friend request:", error);
    return res.status(400).json({ message: error.message || "Failed to cancel friend request." });
  }
};

export const getPendingRequests = async (req, res) => {
  try {
    const requests = await listPendingRequestsForUser({ userId: req.userId });
    return res.status(200).json({ requests });
  } catch (error) {
    console.error("Error fetching pending requests:", error);
    return res.status(500).json({ message: "Failed to fetch pending requests." });
  }
};

export const getFriendsList = async (req, res) => {
  try {
    const friends = await listFriendsForUser({ userId: req.userId });
    return res.status(200).json({ friends });
  } catch (error) {
    console.error("Error fetching friends list:", error);
    return res.status(500).json({ message: "Failed to fetch friends list." });
  }
};
