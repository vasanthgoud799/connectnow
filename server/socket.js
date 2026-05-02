import { Server as SocketIOServer } from "socket.io";
import User from "./models/UserModel.js";
import Message from "./models/MessagesModel.js";
import Group from "./models/GroupModel.js";
import ChatPreference from "./models/ChatPreferenceModel.js";
import {
  createDirectMessage,
  createGroupMessage,
  deleteMessage,
  editMessage,
  getConversationKey,
  hydrateMessageMediaForUser,
  markConversationSeen,
  markMessagesDelivered,
  reactToMessage,
  removeReactionFromMessage,
  togglePinMessage,
  toggleStarredMessage,
  voteOnPollMessage,
} from "./services/MessageService.js";
import {
  createNotification,
  getUnreadNotificationCount,
} from "./services/NotificationService.js";
import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  getClientIp,
  getDeviceFingerprint,
  hashValue,
  logSecurityEvent,
  parseCookieHeader,
  validateSessionRecord,
  verifyAppJwt,
} from "./utils/AuthSecurity.js";

let ioInstance = null;

export const getUserRoom = (userId) => `user:${userId}`;
const getConversationRoom = (conversationKey) => `conversation:${conversationKey}`;
export const getIO = () => ioInstance;

const setupSocket = (server) => {
  const allowedOrigins = (process.env.ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const io = new SocketIOServer(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 60000,
    maxHttpBufferSize: 10 * 1024 * 1024,
  });
  ioInstance = io;

  const userSocketsMap = new Map();
  const callProfilesMap = new Map();
  const activeConversationBySocket = new Map();
  const callSessions = new Map();
  const userCallSessionMap = new Map();
  const groupCallSessions = new Map();
  const userGroupCallSessionMap = new Map();
  const groupCallInviteTimeouts = new Map();
  const callDisconnectTimeouts = new Map();
  const clearCallSession = (sessionId) => {
    const session = callSessions.get(sessionId);
    if (!session) return;

    userCallSessionMap.delete(String(session.callerId));
    userCallSessionMap.delete(String(session.calleeId));
    callSessions.delete(sessionId);
  };

  const cancelRingingDirectCallSession = (sessionId, cancelledByUserId) => {
    const session = callSessions.get(sessionId);
    if (!session || session.status !== "ringing") return;

    const callerId = String(session.callerId);
    const calleeId = String(session.calleeId);
    const cancelledBy = String(cancelledByUserId);
    const otherUserId = cancelledBy === callerId ? calleeId : callerId;

    clearCallSession(sessionId);
    io.to(getUserRoom(String(otherUserId))).emit("user-hanged-up", {
      sessionId,
      cancelledBeforeAnswer: true,
    });
  };

  const findSessionBySocketId = (socketId) => {
    for (const session of callSessions.values()) {
      if (
        session.callerSocketId === socketId ||
        session.calleeSocketId === socketId
      ) {
        return session;
      }
    }

    return null;
  };

  const clearPendingCallDisconnect = (userId) => {
    const timeout = callDisconnectTimeouts.get(String(userId));
    if (timeout) {
      clearTimeout(timeout);
      callDisconnectTimeouts.delete(String(userId));
    }
  };

  const addUserSocket = (userId, socketId) => {
    const existingSocketIds = userSocketsMap.get(userId) || new Set();
    existingSocketIds.add(socketId);
    userSocketsMap.set(userId, existingSocketIds);
  };

  const removeUserSocket = (userId, socketId) => {
    const existingSocketIds = userSocketsMap.get(userId);

    if (!existingSocketIds) return;

    existingSocketIds.delete(socketId);

    if (existingSocketIds.size === 0) {
      userSocketsMap.delete(userId);
    } else {
      userSocketsMap.set(userId, existingSocketIds);
    }
  };

  const isUserOnline = (userId) => {
    return Boolean(userSocketsMap.get(String(userId))?.size);
  };

  const isUserBusy = (userId) =>
    userCallSessionMap.has(String(userId)) ||
    userGroupCallSessionMap.has(String(userId));

  const buildCallProfileForUser = async (userId) => {
    const normalizedUserId = String(userId);
    const cached = callProfilesMap.get(normalizedUserId);
    if (cached) {
      return {
        userId: normalizedUserId,
        username: cached.username,
        displayName: cached.displayName || cached.username,
        image: cached.image || null,
        email: cached.email || null,
      };
    }

    const user = await User.findById(normalizedUserId).select(
      "firstName lastName email image"
    );

    return {
      userId: normalizedUserId,
      username: user?.firstName || user?.email || "Member",
      displayName:
        [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
        user?.email ||
        "Member",
      image: user?.image || null,
      email: user?.email || null,
    };
  };

  const getAcceptedGroupCallParticipants = (session) =>
    [...session.participants.values()].map((participant) => ({
      userId: String(participant.userId),
      socketId: participant.socketId,
      username: participant.profile?.username,
      displayName: participant.profile?.displayName,
      image: participant.profile?.image || null,
      email: participant.profile?.email || null,
    }));

  const emitGroupCallParticipants = (session) => {
    const participants = getAcceptedGroupCallParticipants(session);
    participants.forEach((participant) => {
      io.to(getUserRoom(String(participant.userId))).emit("group_call_participants", {
        sessionId: session.id,
        participants,
      });
    });
  };

  const endGroupCallSession = (sessionId, reason = "ended") => {
    const session = groupCallSessions.get(sessionId);
    if (!session) return;

    const inviteTimeout = groupCallInviteTimeouts.get(sessionId);
    if (inviteTimeout) {
      clearTimeout(inviteTimeout);
      groupCallInviteTimeouts.delete(sessionId);
    }

    [...session.participants.keys()].forEach((participantUserId) => {
      userGroupCallSessionMap.delete(String(participantUserId));
      io.to(getUserRoom(String(participantUserId))).emit("group_call_ended", {
        sessionId,
        groupId: String(session.groupId),
        reason,
      });
    });

    [...(session.invitedUserIds || [])].forEach((invitedUserId) => {
      io.to(getUserRoom(String(invitedUserId))).emit("group_call_ended", {
        sessionId,
        groupId: String(session.groupId),
        reason,
      });
    });

    groupCallSessions.delete(sessionId);
  };

  const scheduleGroupCallInviteTimeout = (sessionId, timeoutMs = 30000) => {
    const existingTimeout = groupCallInviteTimeouts.get(sessionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeoutId = setTimeout(() => {
      const session = groupCallSessions.get(sessionId);
      if (!session) return;

      if (session.participants.size <= 1) {
        endGroupCallSession(sessionId, "no_answer");
      }
    }, timeoutMs);

    groupCallInviteTimeouts.set(sessionId, timeoutId);
  };

  const removeParticipantFromGroupCall = ({
    sessionId,
    userId,
    reason = "left",
  }) => {
    const session = groupCallSessions.get(sessionId);
    if (!session) return;

    const normalizedUserId = String(userId);
    if (!session.participants.has(normalizedUserId)) return;

    session.participants.delete(normalizedUserId);
    userGroupCallSessionMap.delete(normalizedUserId);

    const remainingParticipants = getAcceptedGroupCallParticipants(session);

    remainingParticipants.forEach((participant) => {
      io.to(getUserRoom(String(participant.userId))).emit("group_call_participant_left", {
        sessionId,
        userId: normalizedUserId,
        reason,
      });
    });

    if (remainingParticipants.length <= 1) {
      endGroupCallSession(sessionId, remainingParticipants.length ? "ended" : reason);
      return;
    }

    groupCallSessions.set(sessionId, session);
    emitGroupCallParticipants(session);
  };

  const buildActiveUsersPayload = async () => {
    const activeUserIds = [...userSocketsMap.keys()];

    const users = await Promise.all(
      activeUserIds.map(async (userId) => {
        const cached = callProfilesMap.get(String(userId));

        if (cached) {
          return {
            ...cached,
            userId: String(userId),
          };
        }

        const user = await User.findById(userId).select(
          "firstName lastName email image"
        );

        if (!user) {
          return {
            userId: String(userId),
            username: "Unknown",
            displayName: "Unknown",
          };
        }

        return {
          userId: String(user._id),
          username: user.firstName || user.email,
          displayName:
            [user.firstName, user.lastName].filter(Boolean).join(" ") ||
            user.email,
          image: user.image || null,
          email: user.email || null,
        };
      })
    );

    return users;
  };

  const broadcastActiveUsers = async () => {
    const activeUsers = await buildActiveUsersPayload();
    io.emit("broadcast", {
      event: "ACTIVE_USERS",
      activeUsers,
    });
  };

  const emitStatusUpdates = (updates, eventName) => {
    updates.forEach((update) => {
      io.to(getUserRoom(update.senderId)).emit(eventName, update);
      io.to(getUserRoom(update.recipientId)).emit(eventName, update);
    });
  };

  const emitNotificationCreated = async (notification) => {
    if (!notification) return;

    const unreadCount = await getUnreadNotificationCount({
      userId: notification.userId,
    });

    io.to(getUserRoom(String(notification.userId))).emit("notification_created", {
      notification,
      unreadCount,
    });
  };

  const notifyDirectMessage = async ({
    senderId,
    recipientId,
    message,
  }) => {
    const messagePreview =
      message?.encryption?.enabled && message?.messageType === "poll"
        ? "Encrypted poll"
        : message?.encryption?.enabled && message?.messageType === "text"
          ? "Encrypted message"
          : message.content;
    const notification = await createNotification({
      userId: recipientId,
      type: "new_message",
      entityId: String(message._id),
      conversationKey: message.conversationKey,
      meta: {
        conversationKey: message.conversationKey,
        senderId: String(senderId),
        messagePreview,
      },
    });

    await emitNotificationCreated(notification);
  };

  const notifyGroupMessage = async ({ group, senderId, message }) => {
    const senderUser = await User.findById(senderId).select(
      "firstName lastName email"
    );
    const senderLabel =
      [senderUser?.firstName, senderUser?.lastName].filter(Boolean).join(" ") ||
      senderUser?.email ||
      "Someone";
    const mentionTokens = (String(message.content || "").match(/@\S+/g) || []).map(
      (token) => token.toLowerCase()
    );

    await Promise.all(
      group.members.map(async (member) => {
        const memberId = String(member.user?._id || member.user);
        if (memberId === String(senderId)) return;

        const memberUser = member.user || {};
        const userHandles = [
          memberUser.email,
          memberUser.firstName,
          `${memberUser.firstName || ""}${memberUser.lastName || ""}`,
        ]
          .filter(Boolean)
          .map((value) => `@${String(value).replace(/\s+/g, "").toLowerCase()}`);

        const isMention = mentionTokens.some((token) => userHandles.includes(token));
        const notification = await createNotification({
          userId: memberId,
          type: isMention ? "mention" : "group_message",
          entityId: String(message._id),
          conversationKey: message.conversationKey,
          meta: {
            conversationKey: message.conversationKey,
            groupId: String(group._id),
            groupName: group.name,
            senderId: String(senderId),
            senderLabel,
            messagePreview:
              message?.encryption?.enabled && message?.messageType === "poll"
                ? "Encrypted poll"
                : message?.encryption?.enabled && message?.messageType === "text"
                  ? "Encrypted message"
                  : message.content,
          },
        });

        await emitNotificationCreated(notification);
      })
    );
  };

  const syncPendingDeliveriesForUser = async (userId) => {
    const updates = await markMessagesDelivered({ recipientId: userId });
    emitStatusUpdates(updates, "message_delivered");
  };

  io.use(async (socket, next) => {
    const req = {
      headers: socket.handshake.headers || {},
      ip: socket.handshake.address,
      socket: { remoteAddress: socket.handshake.address },
      method: "SOCKET",
      originalUrl: "/socket.io",
    };

    try {
      const cookies = parseCookieHeader(socket.handshake.headers?.cookie || "");
      const token = cookies[SESSION_COOKIE_NAME] || socket.handshake.auth?.token;
      const csrfCookie = cookies[CSRF_COOKIE_NAME];
      const csrfToken = socket.handshake.auth?.csrfToken || socket.handshake.headers?.["x-csrf-token"];
      const usingAuthTokenFallback = Boolean(socket.handshake.auth?.token && !cookies[SESSION_COOKIE_NAME]);

      if (!token) {
        await logSecurityEvent({
          req,
          type: "socket_missing_token",
          severity: "medium",
          metadata: { ipAddress: getClientIp(req) },
        });
        return next(new Error("Unauthorized"));
      }

      const decoded = verifyAppJwt(token);
      const validation = await validateSessionRecord({ decoded, req });

      if (!validation.ok) {
        await logSecurityEvent({
          req,
          type: "socket_invalid_session",
          severity: "medium",
          userId: decoded?.userId || null,
        });
        return next(new Error("Unauthorized"));
      }

      const csrfMatchesSession =
        Boolean(csrfToken) && hashValue(csrfToken) === validation.session.csrfTokenHash;
      const csrfMatchesCookie =
        Boolean(csrfToken) && Boolean(csrfCookie) && csrfToken === csrfCookie;

      if (!csrfMatchesSession || (!usingAuthTokenFallback && !csrfMatchesCookie)) {
        await logSecurityEvent({
          req,
          type: "socket_csrf_validation_failed",
          severity: "high",
          userId: decoded.userId,
          metadata: { deviceFingerprint: getDeviceFingerprint(req) },
        });
        return next(new Error("Unauthorized"));
      }

      socket.data.userId = String(decoded.userId);
      socket.data.authSessionId = decoded.sid || decoded.jti;
      return next();
    } catch (error) {
      await logSecurityEvent({
        req,
        type: "socket_auth_failed",
        severity: "medium",
        metadata: { name: error.name },
      });
      return next(new Error("Unauthorized"));
    }
  });

  const disconnect = async (socket, reason) => {
    console.log(`Client disconnected: ${socket.id}`, { reason });

    const userId = socket.data.userId;
    activeConversationBySocket.delete(socket.id);

    if (userId) {
      const activeGroupCallSessionId = userGroupCallSessionMap.get(String(userId));
      if (activeGroupCallSessionId) {
        removeParticipantFromGroupCall({
          sessionId: activeGroupCallSessionId,
          userId,
          reason: "disconnect",
        });
      }

      const activeCallSessionId = userCallSessionMap.get(String(userId));
      if (activeCallSessionId) {
        clearPendingCallDisconnect(userId);
        const timeout = setTimeout(() => {
          const session = callSessions.get(activeCallSessionId);
          if (!session || isUserOnline(userId)) {
            callDisconnectTimeouts.delete(String(userId));
            return;
          }

          const otherUserId =
            session.callerId === String(userId)
              ? session.calleeId
              : session.callerId;

          io.to(getUserRoom(String(otherUserId))).emit("user-hanged-up", {
            sessionId: activeCallSessionId,
          });
          clearCallSession(activeCallSessionId);
          callDisconnectTimeouts.delete(String(userId));
        }, 5000);

        callDisconnectTimeouts.set(String(userId), timeout);
      }

      removeUserSocket(userId, socket.id);

      if (!isUserOnline(userId)) {
        callProfilesMap.delete(String(userId));
        await User.findByIdAndUpdate(userId, {
          status: "Offline",
          lastSeen: new Date(),
        }).catch((error) =>
          console.error("Error updating offline status:", error)
        );
      }

      await broadcastActiveUsers();
    }
  };

  const handleSendMessage = async ({ socket, payload, callback }) => {
    try {
      const senderId = socket.data.userId;
      const recipientId = payload?.recipient;
      const groupId = payload?.groupId;

      if (!senderId || (!recipientId && !groupId)) {
        callback?.({ ok: false, error: "recipient or groupId is required" });
        return;
      }

      const message = groupId
        ? await createGroupMessage({
            groupId,
            senderId,
            content: payload.content,
            messageType: payload.messageType,
            fileUrl: payload.fileUrl,
            storageProvider: payload.storageProvider,
            storagePath: payload.storagePath,
            storageBucket: payload.storageBucket,
            timestamp: payload.timestamp,
            meta: payload.meta,
            replyTo: payload.replyTo,
            forwardedFromMessageId: payload.forwardedFromMessageId,
            isForwarded: payload.isForwarded,
            encryption: payload.encryption,
            mediaEncryption: payload.mediaEncryption,
          })
        : await createDirectMessage({
            senderId,
            recipientId,
            content: payload.content,
            messageType: payload.messageType,
            fileUrl: payload.fileUrl,
            storageProvider: payload.storageProvider,
            storagePath: payload.storagePath,
            storageBucket: payload.storageBucket,
            timestamp: payload.timestamp,
            meta: payload.meta,
            replyTo: payload.replyTo,
            forwardedFromMessageId: payload.forwardedFromMessageId,
            isForwarded: payload.isForwarded,
            encryption: payload.encryption,
            mediaEncryption: payload.mediaEncryption,
          });

      const populatedMessage = await Message.findById(message._id)
        .populate("sender", "id email firstName lastName image")
        .populate("recipient", "id email firstName lastName image")
        .populate("group", "name description image members");
      await hydrateMessageMediaForUser({ message: populatedMessage });

      const normalizedConversationKey = populatedMessage.conversationKey;

      if (groupId) {
        const group = await Group.findById(groupId).populate(
          "members.user",
          "firstName lastName email image status"
        );

        if (!group) {
          callback?.({ ok: false, error: "Group not found" });
          return;
        }

        group.members.forEach((member) => {
          const memberId = String(member.user?._id || member.user);
          io.to(getUserRoom(memberId)).emit("receive_message", populatedMessage);
          io.to(getUserRoom(memberId)).emit("receiveMessage", populatedMessage);
        });

        await notifyGroupMessage({
          group,
          senderId,
          message: populatedMessage,
        });

        callback?.({ ok: true, message: populatedMessage });
        return;
      }

      io.to(getUserRoom(senderId)).emit("receive_message", populatedMessage);
      io.to(getUserRoom(senderId)).emit("receiveMessage", populatedMessage);
      io.to(getUserRoom(recipientId)).emit("receive_message", populatedMessage);
      io.to(getUserRoom(recipientId)).emit("receiveMessage", populatedMessage);

      const recipientActiveConversation = [...activeConversationBySocket.entries()].some(
        ([socketId, conversationKey]) => {
          const ownerUserId = io.sockets.sockets.get(socketId)?.data?.userId;
          return (
            String(ownerUserId) === String(recipientId) &&
            conversationKey === normalizedConversationKey
          );
        }
      );

      if (isUserOnline(recipientId)) {
        const deliveredUpdates = await markMessagesDelivered({
          recipientId,
          conversationKey: normalizedConversationKey,
        });
        emitStatusUpdates(deliveredUpdates, "message_delivered");
      }

      if (recipientActiveConversation) {
        const seenUpdates = await markConversationSeen({
          recipientId,
          conversationKey: normalizedConversationKey,
        });
        emitStatusUpdates(seenUpdates, "message_seen");
      }

      await notifyDirectMessage({
        senderId,
        recipientId,
        message: populatedMessage,
      });

      callback?.({ ok: true, message: populatedMessage });
    } catch (error) {
      console.error("Error sending message:", error);
      callback?.({ ok: false, error: "Failed to send message" });
    }
  };

  const emitMessageUpdate = async (message, eventName) => {
    if (!message) return;

    if (message.chatType === "group") {
      const group = await Group.findById(message.group?._id || message.group).populate(
        "members.user",
        "firstName lastName email image status"
      );

      group?.members?.forEach((member) => {
        const memberId = String(member.user?._id || member.user);
        io.to(getUserRoom(memberId)).emit(eventName, message);
      });

      return;
    }

    const senderId = String(message.sender?._id || message.sender);
    const recipientId = String(message.recipient?._id || message.recipient);
    io.to(getUserRoom(senderId)).emit(eventName, message);
    io.to(getUserRoom(recipientId)).emit(eventName, message);
  };

  const handleVotePoll = async ({ socket, payload, callback }) => {
    try {
      const userId = socket.data.userId;
      const messageId = payload?.messageId;
      const optionIds = Array.isArray(payload?.optionIds) ? payload.optionIds : [];

      if (!userId || !messageId) {
        callback?.({ ok: false, error: "messageId is required" });
        return;
      }

      const updatedMessage = await voteOnPollMessage({
        messageId,
        userId,
        optionIds,
      });

      if (!updatedMessage) {
        callback?.({ ok: false, error: "Poll not found" });
        return;
      }

      if (updatedMessage.chatType === "group") {
        const group = await Group.findById(updatedMessage.group?._id || updatedMessage.group).populate(
          "members.user",
          "firstName lastName email image status"
        );

        group?.members?.forEach((member) => {
          const memberId = String(member.user?._id || member.user);
          io.to(getUserRoom(memberId)).emit("poll_updated", updatedMessage);
        });
      } else {
        const senderId = String(updatedMessage.sender?._id || updatedMessage.sender);
        const recipientId = String(updatedMessage.recipient?._id || updatedMessage.recipient);
        io.to(getUserRoom(senderId)).emit("poll_updated", updatedMessage);
        io.to(getUserRoom(recipientId)).emit("poll_updated", updatedMessage);
      }

      callback?.({ ok: true, message: updatedMessage });
    } catch (error) {
      console.error("Error voting on poll:", error);
      callback?.({ ok: false, error: error.message || "Failed to vote on poll" });
    }
  };

  io.on("connection", async (socket) => {
    const userId = socket.data.userId;

    if (userId) {
      clearPendingCallDisconnect(userId);
      socket.data.userId = String(userId);
      addUserSocket(String(userId), socket.id);
      socket.join(getUserRoom(String(userId)));

      const activeCallSessionId = userCallSessionMap.get(String(userId));
      if (activeCallSessionId) {
        const activeSession = callSessions.get(activeCallSessionId);
        if (activeSession) {
          if (String(activeSession.callerId) === String(userId)) {
            activeSession.callerSocketId = socket.id;
          }

          if (String(activeSession.calleeId) === String(userId)) {
            activeSession.calleeSocketId = socket.id;
          }

          callSessions.set(activeCallSessionId, activeSession);
        }
      }

      await User.findByIdAndUpdate(userId, {
        status: "Online",
      }).catch((error) =>
        console.error("Error updating online status:", error)
      );

      await syncPendingDeliveriesForUser(String(userId));
      await broadcastActiveUsers();

      console.log(`User connected: ${userId} with socket ID: ${socket.id}`);
    } else {
      console.log("User ID not provided during connection");
    }

    socket.on("join_conversation", async ({ otherUserId, conversationKey }) => {
      const resolvedConversationKey =
        conversationKey ||
        (otherUserId ? getConversationKey(socket.data.userId, otherUserId) : null);

      if (!resolvedConversationKey) return;

      activeConversationBySocket.set(socket.id, resolvedConversationKey);
      socket.join(getConversationRoom(resolvedConversationKey));

      const seenUpdates = await markConversationSeen({
        recipientId: socket.data.userId,
        conversationKey: resolvedConversationKey,
      });

      emitStatusUpdates(seenUpdates, "message_seen");
    });

    socket.on("get-active-users", async () => {
      const activeUsers = await buildActiveUsersPayload();
      socket.emit("broadcast", {
        event: "ACTIVE_USERS",
        activeUsers,
      });
    });

    socket.on("register-new-user", async (data) => {
      if (!socket.data.userId) return;

      callProfilesMap.set(String(socket.data.userId), {
        userId: String(socket.data.userId),
        username: data.username,
        displayName: data.displayName || data.username,
        image: data.image || null,
        email: data.email || null,
      });

      await broadcastActiveUsers();
    });

    socket.on("chat_settings_updated", async (payload) => {
      const preference = await ChatPreference.findOne({
        userId: socket.data.userId,
        conversationKey: payload?.conversationKey,
      }).lean();

      io.to(getUserRoom(String(socket.data.userId))).emit("chat_settings_updated", {
        conversationKey: payload?.conversationKey,
        preference,
      });
    });

    socket.on("group_call_start", async (payload, callback) => {
      try {
        const callerId = String(socket.data.userId);
        const groupId = payload?.groupId;
        const callType = payload?.callType === "audio" ? "audio" : "video";

        if (!callerId || !groupId) {
          callback?.({ ok: false, error: "groupId is required" });
          return;
        }

        if (isUserBusy(callerId)) {
          callback?.({ ok: false, error: "You are already in another call." });
          return;
        }

        const group = await Group.findById(groupId).populate(
          "members.user",
          "firstName lastName email image status"
        );

        if (!group) {
          callback?.({ ok: false, error: "Group not found" });
          return;
        }

        const isMember = group.members.some(
          (member) => String(member.user?._id || member.user) === callerId
        );

        if (!isMember) {
          callback?.({ ok: false, error: "You are not a member of this group" });
          return;
        }

        const requestedParticipantIds = Array.isArray(payload?.participantIds)
          ? [...new Set(payload.participantIds.map(String))]
          : [];

        const onlineMembers = group.members
          .map((member) => String(member.user?._id || member.user))
          .filter(
            (memberId) =>
              memberId !== callerId &&
              isUserOnline(memberId) &&
              !isUserBusy(memberId) &&
              (!requestedParticipantIds.length || requestedParticipantIds.includes(memberId))
          );

        if (!onlineMembers.length) {
          callback?.({ ok: false, error: "No available group members are online." });
          return;
        }

        const sessionId = `group:${groupId}:${Date.now()}`;
        const hostProfile = await buildCallProfileForUser(callerId);
        const session = {
          id: sessionId,
          groupId: String(groupId),
          groupName: group.name,
          hostId: callerId,
          callType,
          invitedUserIds: new Set(onlineMembers),
          participants: new Map([
            [
              callerId,
              {
                userId: callerId,
                socketId: socket.id,
                profile: hostProfile,
              },
            ],
          ]),
        };

        groupCallSessions.set(sessionId, session);
        userGroupCallSessionMap.set(callerId, sessionId);
        scheduleGroupCallInviteTimeout(sessionId);

        onlineMembers.forEach((memberId) => {
          io.to(getUserRoom(memberId)).emit("group_call_invitation", {
            sessionId,
            groupId: String(groupId),
            groupName: group.name,
            callType,
            callerUserId: callerId,
            callerUsername: hostProfile.displayName,
            callerImage: hostProfile.image,
            invitedCount: onlineMembers.length,
          });
        });

        callback?.({
          ok: true,
          sessionId,
          groupId: String(groupId),
          groupName: group.name,
          callType,
          participants: getAcceptedGroupCallParticipants(session),
          invitedCount: onlineMembers.length,
        });
      } catch (error) {
        console.error("Error starting group call:", error);
        callback?.({ ok: false, error: "Failed to start group call" });
      }
    });

    socket.on("group_call_accept", async ({ sessionId }, callback) => {
      try {
        const userId = String(socket.data.userId);
        const session = groupCallSessions.get(sessionId);

        if (!session) {
          callback?.({ ok: false, error: "Group call not found" });
          return;
        }

        if (
          isUserBusy(userId) &&
          userGroupCallSessionMap.get(userId) !== sessionId
        ) {
          callback?.({ ok: false, error: "You are already in another call." });
          return;
        }

        const participantProfile = await buildCallProfileForUser(userId);
        session.participants.set(userId, {
          userId,
          socketId: socket.id,
          profile: participantProfile,
        });
        userGroupCallSessionMap.set(userId, sessionId);
        groupCallSessions.set(sessionId, session);

        const inviteTimeout = groupCallInviteTimeouts.get(sessionId);
        if (inviteTimeout) {
          clearTimeout(inviteTimeout);
          groupCallInviteTimeouts.delete(sessionId);
        }

        const participants = getAcceptedGroupCallParticipants(session);
        io.to(getUserRoom(userId)).emit("group_call_joined", {
          sessionId,
          groupId: session.groupId,
          groupName: session.groupName,
          callType: session.callType,
          participants,
        });

        participants
          .filter((participant) => String(participant.userId) !== userId)
          .forEach((participant) => {
            io.to(getUserRoom(String(participant.userId))).emit(
              "group_call_participant_joined",
              {
                sessionId,
                participant: {
                  userId,
                  socketId: socket.id,
                  username: participantProfile.username,
                  displayName: participantProfile.displayName,
                  image: participantProfile.image,
                  email: participantProfile.email,
                },
              }
            );
          });

        emitGroupCallParticipants(session);

        callback?.({
          ok: true,
          sessionId,
          groupId: session.groupId,
          groupName: session.groupName,
          callType: session.callType,
          participants,
        });
      } catch (error) {
        console.error("Error accepting group call:", error);
        callback?.({ ok: false, error: "Failed to join group call" });
      }
    });

    socket.on("group_call_reject", ({ sessionId }, callback) => {
      const session = groupCallSessions.get(sessionId);
      if (!session) {
        callback?.({ ok: false, error: "Group call not found" });
        return;
      }

      const rejectingUserId = String(socket.data.userId);
      session.invitedUserIds?.delete?.(rejectingUserId);
      groupCallSessions.set(sessionId, session);

      io.to(getUserRoom(String(session.hostId))).emit("group_call_invitation_rejected", {
        sessionId,
        userId: rejectingUserId,
      });

      if (
        session.participants.size <= 1 &&
        (!session.invitedUserIds || session.invitedUserIds.size === 0)
      ) {
        endGroupCallSession(sessionId, "rejected");
      }

      callback?.({ ok: true });
    });

    socket.on("group_call_offer", ({ sessionId, targetUserId, offer }) => {
      if (!sessionId || !targetUserId || !offer) return;
      const session = groupCallSessions.get(sessionId);
      if (!session) return;
      if (!session.participants.has(String(socket.data.userId))) return;
      if (!session.participants.has(String(targetUserId))) return;

      io.to(getUserRoom(String(targetUserId))).emit("group_call_offer", {
        sessionId,
        senderUserId: String(socket.data.userId),
        offer,
      });
    });

    socket.on("group_call_answer", ({ sessionId, targetUserId, answer }) => {
      if (!sessionId || !targetUserId || !answer) return;
      const session = groupCallSessions.get(sessionId);
      if (!session) return;
      if (!session.participants.has(String(socket.data.userId))) return;
      if (!session.participants.has(String(targetUserId))) return;

      io.to(getUserRoom(String(targetUserId))).emit("group_call_answer", {
        sessionId,
        senderUserId: String(socket.data.userId),
        answer,
      });
    });

    socket.on("group_call_candidate", ({ sessionId, targetUserId, candidate }) => {
      if (!sessionId || !targetUserId || !candidate) return;
      const session = groupCallSessions.get(sessionId);
      if (!session) return;
      if (!session.participants.has(String(socket.data.userId))) return;
      if (!session.participants.has(String(targetUserId))) return;

      io.to(getUserRoom(String(targetUserId))).emit("group_call_candidate", {
        sessionId,
        senderUserId: String(socket.data.userId),
        candidate,
      });
    });

    socket.on("group_call_leave", ({ sessionId }, callback) => {
      if (!sessionId) {
        callback?.({ ok: false, error: "sessionId is required" });
        return;
      }

      const activeGroupSession = groupCallSessions.get(sessionId);
      if (
        activeGroupSession &&
        String(activeGroupSession.hostId) === String(socket.data.userId) &&
        activeGroupSession.participants.size <= 1
      ) {
        endGroupCallSession(sessionId, "cancelled");
        callback?.({ ok: true });
        return;
      }

      removeParticipantFromGroupCall({
        sessionId,
        userId: socket.data.userId,
        reason: "left",
      });
      callback?.({ ok: true });
    });

    socket.on("request_e2ee_init", ({ userIds = [] } = {}) => {
      const requesterId = String(socket.data.userId || "");
      if (!requesterId) return;

      [...new Set((Array.isArray(userIds) ? userIds : []).map(String))]
        .filter((userId) => userId && userId !== requesterId)
        .forEach((userId) => {
          io.to(getUserRoom(userId)).emit("e2ee_init_requested", {
            requestedBy: requesterId,
          });
        });
    });

    socket.on("pre-offer", ({ callee, caller, callType }) => {
      const callerId = String(socket.data.userId);
      const targetUserId = callee?.userId;
      const targetSocketId = callee?.socketId;

      if (!callerId || !targetUserId) return;

      if (userCallSessionMap.has(callerId) || userCallSessionMap.has(String(targetUserId))) {
        io.to(socket.id).emit("pre-offer-answer", {
          answer: "CALL_BUSY",
        });
        return;
      }

      const calleeSocketSet = userSocketsMap.get(String(targetUserId));
      const resolvedCalleeSocketId =
        targetSocketId || (calleeSocketSet ? [...calleeSocketSet][0] : null);

      if (!resolvedCalleeSocketId) {
        io.to(socket.id).emit("pre-offer-answer", {
          answer: "CALL_NOT_AVAILABLE",
        });
        return;
      }

      const sessionId = `${callerId}:${String(targetUserId)}:${Date.now()}`;
      const session = {
        id: sessionId,
        callerId,
        calleeId: String(targetUserId),
        callerSocketId: socket.id,
        calleeSocketId: resolvedCalleeSocketId,
        status: "ringing",
      };

      callSessions.set(sessionId, session);
      userCallSessionMap.set(callerId, sessionId);
      userCallSessionMap.set(String(targetUserId), sessionId);

      if (targetUserId) {
        io.to(getUserRoom(String(targetUserId))).emit("pre-offer", {
          callerUsername: caller?.displayName || caller?.username,
          callerImage: caller?.imageUrl || caller?.image,
          callerUserId: socket.data.userId,
          callerSocketId: socket.id,
          callType: callType || "video",
          sessionId,
        });
        return;
      }

      if (resolvedCalleeSocketId) {
        io.to(resolvedCalleeSocketId).emit("pre-offer", {
          callerUsername: caller?.displayName || caller?.username,
          callerImage: caller?.imageUrl || caller?.image,
          callerUserId: socket.data.userId,
          callerSocketId: socket.id,
          callType: callType || "video",
          sessionId,
        });
      }
    });

    socket.on("pre-offer-answer", ({ callerSocketId, answer, sessionId }) => {
      const session =
        (sessionId ? callSessions.get(sessionId) : null) ||
        findSessionBySocketId(socket.id);
      if (!session) return;

      if (answer === "CALL_ACCEPTED") {
        session.status = "active";
        session.calleeSocketId = socket.id;
        callSessions.set(session.id, session);
      } else {
        clearCallSession(session.id);
      }

      io.to(getUserRoom(String(session.callerId))).emit("pre-offer-answer", {
        answer,
        answererSocketId: socket.id,
        sessionId: session.id,
      });
    });

    socket.on("webRTC-offer", ({ sessionId, offer }) => {
      if (!sessionId || !offer) return;

      const session = callSessions.get(sessionId);
      if (!session) return;

      const senderId = String(socket.data.userId);
      const targetUserId =
        senderId === String(session.callerId)
          ? session.calleeId
          : session.callerId;

      io.to(getUserRoom(String(targetUserId))).emit("webRTC-offer", {
        offer,
        sessionId,
      });
    });

    socket.on("webRTC-answer", ({ sessionId, answer }) => {
      if (!sessionId || !answer) return;

      const session = callSessions.get(sessionId);
      if (!session) return;

      const senderId = String(socket.data.userId);
      const targetUserId =
        senderId === String(session.callerId)
          ? session.calleeId
          : session.callerId;

      io.to(getUserRoom(String(targetUserId))).emit("webRTC-answer", {
        answer,
        sessionId,
      });
    });

    socket.on("webRTC-candidate", ({ sessionId, candidate }) => {
      if (!sessionId || !candidate) return;

      const session = callSessions.get(sessionId);
      if (!session) return;

      const senderId = String(socket.data.userId);
      const targetUserId =
        senderId === String(session.callerId)
          ? session.calleeId
          : session.callerId;

      io.to(getUserRoom(String(targetUserId))).emit("webRTC-candidate", {
        candidate,
        sessionId,
      });
    });

    socket.on("user-hanged-up", ({ sessionId } = {}) => {
      const session =
        (sessionId ? callSessions.get(sessionId) : null) ||
        findSessionBySocketId(socket.id);
      if (session) {
        if (session.status === "ringing") {
          cancelRingingDirectCallSession(session.id, socket.data.userId);
          return;
        }

        const otherUserId =
          String(session.callerId) === String(socket.data.userId)
            ? session.calleeId
            : session.callerId;

        clearCallSession(session.id);
        io.to(getUserRoom(String(otherUserId))).emit("user-hanged-up", {
          sessionId: session.id,
        });
      }
    });

    socket.on("leave_conversation", ({ conversationKey, otherUserId } = {}) => {
      const resolvedConversationKey =
        conversationKey ||
        (otherUserId ? getConversationKey(socket.data.userId, otherUserId) : null);

      if (resolvedConversationKey) {
        socket.leave(getConversationRoom(resolvedConversationKey));
      }

      activeConversationBySocket.delete(socket.id);
    });

    socket.on("send_message", (payload, callback) =>
      handleSendMessage({ socket, payload, callback })
    );

    socket.on("vote_poll", (payload, callback) =>
      handleVotePoll({ socket, payload, callback })
    );

    socket.on("react_message", async (payload, callback) => {
      try {
      const updatedMessage = await reactToMessage({
          messageId: payload?.messageId,
          userId: socket.data.userId,
          emoji: payload?.emoji,
        });
        await hydrateMessageMediaForUser({ message: updatedMessage });
        await emitMessageUpdate(updatedMessage, "message_reacted");
        callback?.({ ok: true, message: updatedMessage });
      } catch (error) {
        console.error("Error reacting to message:", error);
        callback?.({ ok: false, error: error.message || "Failed to react to message" });
      }
    });

    socket.on("remove_reaction", async (payload, callback) => {
      try {
      const updatedMessage = await removeReactionFromMessage({
          messageId: payload?.messageId,
          userId: socket.data.userId,
          emoji: payload?.emoji,
        });
        await hydrateMessageMediaForUser({ message: updatedMessage });
        await emitMessageUpdate(updatedMessage, "message_reaction_removed");
        callback?.({ ok: true, message: updatedMessage });
      } catch (error) {
        console.error("Error removing reaction:", error);
        callback?.({ ok: false, error: error.message || "Failed to remove reaction" });
      }
    });

    socket.on("edit_message", async (payload, callback) => {
      try {
        const updatedMessage = await editMessage({
          messageId: payload?.messageId,
          userId: socket.data.userId,
          content: payload?.content,
          encryption: payload?.encryption,
        });
        await hydrateMessageMediaForUser({ message: updatedMessage });
        await emitMessageUpdate(updatedMessage, "message_edited");
        callback?.({ ok: true, message: updatedMessage });
      } catch (error) {
        console.error("Error editing message:", error);
        callback?.({ ok: false, error: error.message || "Failed to edit message" });
      }
    });

    socket.on("delete_message", async (payload, callback) => {
      try {
        const result = await deleteMessage({
          messageId: payload?.messageId,
          userId: socket.data.userId,
          scope: payload?.scope,
        });

        if (result.mode === "everyone") {
          await hydrateMessageMediaForUser({ message: result.message });
          await emitMessageUpdate(result.message, "message_deleted");
        } else {
          io.to(getUserRoom(String(socket.data.userId))).emit("message_deleted_for_me", result);
        }

        callback?.({ ok: true, ...result });
      } catch (error) {
        console.error("Error deleting message:", error);
        callback?.({ ok: false, error: error.message || "Failed to delete message" });
      }
    });

    socket.on("pin_message", async (payload, callback) => {
      try {
      const updatedMessage = await togglePinMessage({
          messageId: payload?.messageId,
          userId: socket.data.userId,
        });
        await hydrateMessageMediaForUser({ message: updatedMessage });
        await emitMessageUpdate(updatedMessage, "message_pinned");
        callback?.({ ok: true, message: updatedMessage });
      } catch (error) {
        console.error("Error pinning message:", error);
        callback?.({ ok: false, error: error.message || "Failed to pin message" });
      }
    });

    socket.on("star_message", async (payload, callback) => {
      try {
        const result = await toggleStarredMessage({
          messageId: payload?.messageId,
          userId: socket.data.userId,
        });
        io.to(getUserRoom(String(socket.data.userId))).emit("message_starred", result);
        callback?.({ ok: true, ...result });
      } catch (error) {
        console.error("Error starring message:", error);
        callback?.({ ok: false, error: error.message || "Failed to star message" });
      }
    });

    // Backward-compatible alias while the frontend is being upgraded.
    socket.on("sendMessage", (payload, callback) =>
      handleSendMessage({ socket, payload, callback })
    );

    socket.on("mark_messages_seen", async ({ conversationKey, otherUserId } = {}, callback) => {
      try {
        const resolvedConversationKey =
          conversationKey ||
          (otherUserId ? getConversationKey(socket.data.userId, otherUserId) : null);

        if (!resolvedConversationKey) {
          callback?.({ ok: false, error: "conversationKey is required" });
          return;
        }

        const seenUpdates = await markConversationSeen({
          recipientId: socket.data.userId,
          conversationKey: resolvedConversationKey,
        });

        emitStatusUpdates(seenUpdates, "message_seen");
        callback?.({ ok: true, updates: seenUpdates });
      } catch (error) {
        console.error("Error marking messages seen:", error);
        callback?.({ ok: false, error: "Failed to mark messages as seen" });
      }
    });

    socket.on("disconnect", (reason) => disconnect(socket, reason));
  });
};

export default setupSocket;
