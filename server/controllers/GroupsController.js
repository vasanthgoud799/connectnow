import crypto from "crypto";
import Chat from "../models/ChatModel.js";
import Group from "../models/GroupModel.js";
import Message from "../models/MessagesModel.js";
import User from "../models/UserModel.js";
import {
  createNotification,
  getUnreadNotificationCount,
  updateNotificationMetaByReference,
} from "../services/NotificationService.js";
import { createGroupSystemMessage, getGroupConversationKey } from "../services/MessageService.js";
import {
  acceptGroupInvite,
  createGroupInvites,
  rejectGroupInvite,
} from "../services/GroupInviteService.js";
import { getIO, getUserRoom } from "../socket.js";
import {
  buildStableGroupImageUrl,
  deleteStoredMedia,
} from "../services/MediaStorageService.js";

const formatGroup = (group, currentUserId) => ({
  _id: group._id,
  name: group.name,
  description: group.description,
  image: group.image,
  inviteToken: group.inviteToken,
  members: group.members.map((member) => ({
    user: member.user,
    role: member.role,
    mutedUntil: member.mutedUntil,
    joinedAt: member.joinedAt,
  })),
  createdBy: group.createdBy,
  role:
    group.members.find((member) => String(member.user?._id || member.user) === String(currentUserId))
      ?.role || "member",
});

const requireAdminRole = (group, userId) => {
  const currentMember = group.members.find(
    (member) => String(member.user?._id || member.user) === String(userId)
  );

  return currentMember && ["owner", "admin"].includes(currentMember.role);
};

const isGroupMember = (group, userId) =>
  group.members.some(
    (member) => String(member.user?._id || member.user) === String(userId)
  );

const emitGroupUpdated = async (group, actorUserId = null) => {
  const io = getIO();
  if (!io || !group) return;

  await group.populate("members.user", "firstName lastName email image status");

  group.members.forEach((member) => {
    const memberId = String(member.user?._id || member.user);
    io.to(getUserRoom(memberId)).emit("group_updated", {
      group: formatGroup(group, memberId),
      conversationKey: getGroupConversationKey(group._id),
      actorUserId: actorUserId ? String(actorUserId) : null,
    });
  });
};

const emitGroupRemovedForUser = ({ groupId, userId, reason = "removed" }) => {
  const io = getIO();
  if (!io) return;

  io.to(getUserRoom(String(userId))).emit("group_removed", {
    groupId: String(groupId),
    reason,
    conversationKey: getGroupConversationKey(groupId),
  });
};

const emitGroupSystemMessage = async ({ group, senderId, content, meta }) => {
  const systemMessage = await createGroupSystemMessage({
    group,
    senderId,
    content,
    meta,
  });

  const populatedMessage = await Message.findById(systemMessage._id)
    .populate("sender", "id email firstName lastName image")
    .populate("recipient", "id email firstName lastName image")
    .populate("group", "name description image members");

  const io = getIO();
  if (!io || !populatedMessage) return populatedMessage;

  group.members.forEach((member) => {
    const memberId = String(member.user?._id || member.user);
    io.to(getUserRoom(memberId)).emit("receive_message", populatedMessage);
    io.to(getUserRoom(memberId)).emit("receiveMessage", populatedMessage);
  });

  return populatedMessage;
};

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
  io?.to(getUserRoom(String(notification.userId))).emit("notification_update");
};

const buildGroupInviteNotificationMeta = ({ group, senderUser, invite }) => ({
  inviteId: String(invite._id),
  groupId: String(group._id),
  groupName: group.name,
  inviteToken: group.inviteToken,
  senderId: String(senderUser?._id || senderUser?.id || invite.senderId),
  senderLabel:
    [senderUser?.firstName, senderUser?.lastName].filter(Boolean).join(" ") ||
    senderUser?.email ||
    "Group admin",
  senderImage: senderUser?.image || group.image || null,
});

const sendGroupInviteNotifications = async ({ group, senderUser, invites }) => {
  await Promise.all(
    invites.map(async (invite) => {
      const notification = await createNotification({
        userId: invite.receiverId,
        type: "group_invite",
        entityId: String(group._id),
        senderId: invite.senderId,
        referenceId: String(invite._id),
        meta: buildGroupInviteNotificationMeta({ group, senderUser, invite }),
      });

      await emitNotificationCreated(notification);

      const io = getIO();
      io?.to(getUserRoom(String(invite.receiverId))).emit("group_invite_received", {
        invite,
        group: formatGroup(group, invite.receiverId),
        notification,
      });
    })
  );
};

export const listGroups = async (req, res) => {
  try {
    const groups = await Group.find({ "members.user": req.userId })
      .populate("members.user", "firstName lastName email image status")
      .sort({ updatedAt: -1 });

    return res.status(200).json({
      groups: groups.map((group) => formatGroup(group, req.userId)),
    });
  } catch (error) {
    console.error("Error listing groups:", error);
    return res.status(500).json({ message: "Failed to list groups." });
  }
};

export const getGroupDetails = async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId).populate(
      "members.user",
      "firstName lastName email image status"
    );

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    if (!isGroupMember(group, req.userId)) {
      return res.status(403).json({ message: "You are not a member of this group." });
    }

    return res.status(200).json({
      group: formatGroup(group, req.userId),
    });
  } catch (error) {
    console.error("Error fetching group details:", error);
    return res.status(500).json({ message: "Failed to fetch group details." });
  }
};

export const createGroup = async (req, res) => {
  try {
    const { name, description = "", members = [], image = "", imageUpload } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: "Group name is required." });
    }

    const invitedMemberIds = [...new Set(members.map(String))].filter(
      (memberId) => String(memberId) !== String(req.userId)
    );
    const uniqueMemberIds = [req.userId, ...invitedMemberIds];
    const existingUsers = await User.find({ _id: { $in: uniqueMemberIds } }).select(
      "_id firstName lastName email image"
    );

    if (existingUsers.length !== uniqueMemberIds.length) {
      return res.status(400).json({ message: "Some group members were not found." });
    }

    const group = await Group.create({
      name: name.trim(),
      description: description.trim(),
      image,
      imageStorageProvider: imageUpload?.storageProvider || null,
      imageStoragePath: imageUpload?.storagePath || null,
      imageStorageBucket: imageUpload?.storageBucket || null,
      createdBy: req.userId,
      members: [
        {
          user: req.userId,
          role: "owner",
        },
      ],
    });

    const populatedGroup = await Group.findById(group._id).populate(
      "members.user",
      "firstName lastName email image status"
    );

    if (imageUpload?.storagePath) {
      populatedGroup.image = buildStableGroupImageUrl({ req, groupId: group._id });
      await populatedGroup.save();
    }

    await Chat.findOneAndUpdate(
      { conversationKey: getGroupConversationKey(group._id) },
      {
        $set: {
          chatType: "group",
          group: group._id,
          title: populatedGroup.name,
          image: populatedGroup.image || "",
          participants: [req.userId],
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    await createGroupSystemMessage({
      group: populatedGroup,
      senderId: req.userId,
      content: "Group created",
      meta: {
        action: "group_created",
      },
    });

    if (invitedMemberIds.length) {
      const { invites } = await createGroupInvites({
        groupId: group._id,
        senderId: req.userId,
        receiverIds: invitedMemberIds,
      });

      const senderUser = existingUsers.find((user) => String(user._id) === String(req.userId));
      await sendGroupInviteNotifications({
        group: populatedGroup,
        senderUser,
        invites,
      });
    }

    return res.status(201).json({
      group: formatGroup(populatedGroup, req.userId),
      invitedCount: invitedMemberIds.length,
    });
  } catch (error) {
    console.error("Error creating group:", error);
    return res.status(500).json({ message: "Failed to create group." });
  }
};

export const updateGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name, description, image, imageUpload } = req.body;

    const group = await Group.findById(groupId).populate(
      "members.user",
      "firstName lastName email image status"
    );

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    if (!isGroupMember(group, req.userId)) {
      return res.status(403).json({ message: "Only members can update group details." });
    }

    if (typeof name === "string" && name.trim()) {
      group.name = name.trim();
    }
    if (typeof description === "string") {
      group.description = description.trim();
    }
    if (imageUpload?.storagePath) {
      const previousImageStorage = {
        storageProvider: group.imageStorageProvider,
        storagePath: group.imageStoragePath,
        storageBucket: group.imageStorageBucket,
      };
      group.image = buildStableGroupImageUrl({ req, groupId: group._id });
      group.imageStorageProvider = imageUpload.storageProvider || null;
      group.imageStoragePath = imageUpload.storagePath || null;
      group.imageStorageBucket = imageUpload.storageBucket || null;

      if (
        previousImageStorage.storagePath &&
        previousImageStorage.storagePath !== imageUpload.storagePath
      ) {
        deleteStoredMedia(previousImageStorage).catch((cleanupError) =>
          console.error("Error deleting previous group image:", cleanupError.message)
        );
      }
    } else if (typeof image === "string") {
      group.image = image;
    }

    await group.save();

    await Chat.updateOne(
      { conversationKey: getGroupConversationKey(group._id) },
      {
        $set: {
          title: group.name,
          image: group.image || "",
        },
      }
    );

    await emitGroupUpdated(group, req.userId);

    return res.status(200).json({
      group: formatGroup(group, req.userId),
    });
  } catch (error) {
    console.error("Error updating group:", error);
    return res.status(500).json({ message: "Failed to update group." });
  }
};

export const addMembers = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { members = [] } = req.body;

    const group = await Group.findById(groupId).populate(
      "members.user",
      "firstName lastName email image status"
    );

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    if (!requireAdminRole(group, req.userId)) {
      return res.status(403).json({ message: "Only admins can add members." });
    }

    const existingMemberIds = new Set(group.members.map((member) => String(member.user?._id || member.user)));
    const nextMembers = [...new Set(members.map(String))].filter(
      (memberId) => !existingMemberIds.has(memberId)
    );

    if (!nextMembers.length) {
      return res.status(200).json({ group: formatGroup(group, req.userId) });
    }

    const foundUsers = await User.find({ _id: { $in: nextMembers } }).select("_id");
    if (foundUsers.length !== nextMembers.length) {
      return res.status(400).json({ message: "Some invited members were not found." });
    }

    const { invites } = await createGroupInvites({
      groupId,
      senderId: req.userId,
      receiverIds: nextMembers,
    });

    const senderUser = group.members.find(
      (member) => String(member.user?._id || member.user) === String(req.userId)
    )?.user;

    await sendGroupInviteNotifications({
      group,
      senderUser,
      invites,
    });

    await emitGroupUpdated(group, req.userId);

    return res.status(200).json({
      group: formatGroup(group, req.userId),
      invitesSent: invites.length,
    });
  } catch (error) {
    console.error("Error adding group members:", error);
    return res.status(500).json({ message: "Failed to add members." });
  }
};

export const removeMember = async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    const group = await Group.findById(groupId).populate(
      "members.user",
      "firstName lastName email image status"
    );

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    if (!requireAdminRole(group, req.userId)) {
      return res.status(403).json({ message: "Only admins can remove members." });
    }

    const removedMember = group.members.find(
      (member) => String(member.user?._id || member.user) === String(memberId)
    );

    if (!removedMember) {
      return res.status(404).json({ message: "Member not found in this group." });
    }

    const removedMemberName =
      [removedMember.user?.firstName, removedMember.user?.lastName]
        .filter(Boolean)
        .join(" ") ||
      removedMember.user?.email ||
      "A member";

    group.members = group.members.filter(
      (member) => String(member.user?._id || member.user) !== String(memberId)
    );
    await group.save();
    await group.populate("members.user", "firstName lastName email image status");

    await Chat.updateOne(
      { conversationKey: getGroupConversationKey(group._id) },
      {
        $set: {
          participants: group.members.map((member) => member.user?._id || member.user),
        },
      }
    );

    await emitGroupSystemMessage({
      group,
      senderId: req.userId,
      content: `${removedMemberName} was removed`,
      meta: {
        action: "member_removed",
        memberId: String(memberId),
      },
    });
    await emitGroupUpdated(group, req.userId);
    emitGroupRemovedForUser({
      groupId: group._id,
      userId: memberId,
      reason: "removed",
    });

    return res.status(200).json({
      group: formatGroup(group, req.userId),
    });
  } catch (error) {
    console.error("Error removing group member:", error);
    return res.status(500).json({ message: "Failed to remove member." });
  }
};

export const leaveGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId).populate(
      "members.user",
      "firstName lastName email image status"
    );

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    const leavingMember = group.members.find(
      (member) => String(member.user?._id || member.user) === String(req.userId)
    );
    if (!leavingMember) {
      return res.status(404).json({ message: "You are not a member of this group." });
    }

    const leavingMemberName =
      [leavingMember.user?.firstName, leavingMember.user?.lastName]
        .filter(Boolean)
        .join(" ") ||
      leavingMember.user?.email ||
      "A member";

    group.members = group.members.filter(
      (member) => String(member.user?._id || member.user) !== String(req.userId)
    );

    if (!group.members.length) {
      await Chat.deleteOne({ conversationKey: getGroupConversationKey(group._id) });
      await Group.deleteOne({ _id: group._id });
      return res.status(200).json({ deleted: true });
    }

    const ownerStillExists = group.members.some((member) => member.role === "owner");
    if (!ownerStillExists) {
      group.members[0].role = "owner";
    }

    await group.save();

    await Chat.updateOne(
      { conversationKey: getGroupConversationKey(group._id) },
      {
        $set: {
          participants: group.members.map((member) => member.user?._id || member.user),
        },
      }
    );

    await emitGroupSystemMessage({
      group,
      senderId: req.userId,
      content: `${leavingMemberName} left the group`,
      meta: {
        action: "member_left",
        memberId: String(req.userId),
      },
    });
    await emitGroupUpdated(group, req.userId);
    emitGroupRemovedForUser({
      groupId: group._id,
      userId: req.userId,
      reason: "left",
    });

    return res.status(200).json({ left: true });
  } catch (error) {
    console.error("Error leaving group:", error);
    return res.status(500).json({ message: "Failed to leave group." });
  }
};

export const joinGroupByInvite = async (req, res) => {
  try {
    const { token } = req.params;
    const group = await Group.findOne({ inviteToken: token }).populate(
      "members.user",
      "firstName lastName email image status"
    );

    if (!group) {
      return res.status(404).json({ message: "Invite not found." });
    }

    const alreadyMember = group.members.some(
      (member) => String(member.user?._id || member.user) === String(req.userId)
    );

    if (!alreadyMember) {
      group.members.push({
        user: req.userId,
        role: "member",
      });
      await group.save();
      await group.populate("members.user", "firstName lastName email image status");
    }

    await Chat.findOneAndUpdate(
      { conversationKey: getGroupConversationKey(group._id) },
      {
        $set: {
          chatType: "group",
          group: group._id,
          title: group.name,
          image: group.image || "",
          participants: group.members.map((member) => member.user?._id || member.user),
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    if (!alreadyMember) {
      const joiningUser = await User.findById(req.userId).select(
        "firstName lastName email image"
      );
      const joiningName =
        [joiningUser?.firstName, joiningUser?.lastName].filter(Boolean).join(" ") ||
        joiningUser?.email ||
        "A member";

      await emitGroupSystemMessage({
        group,
        senderId: req.userId,
        content: `${joiningName} joined the group`,
        meta: {
          action: "member_joined",
          memberId: String(req.userId),
        },
      });
      await emitGroupUpdated(group, req.userId);
    }

    return res.status(200).json({
      group: formatGroup(group, req.userId),
    });
  } catch (error) {
    console.error("Error joining group by invite:", error);
    return res.status(500).json({ message: "Failed to join group." });
  }
};

export const regenerateInvite = async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId).populate(
      "members.user",
      "firstName lastName email image status"
    );

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    if (!requireAdminRole(group, req.userId)) {
      return res.status(403).json({ message: "Only admins can regenerate invite links." });
    }

    group.inviteToken = crypto.randomBytes(16).toString("hex");
    await group.save();

    return res.status(200).json({
      group: formatGroup(group, req.userId),
    });
  } catch (error) {
    console.error("Error regenerating invite:", error);
    return res.status(500).json({ message: "Failed to regenerate invite." });
  }
};

export const acceptInvite = async (req, res) => {
  try {
    const { invite, group } = await acceptGroupInvite({
      inviteId: req.params.inviteId,
      userId: req.userId,
    });

    const joiningUser =
      group.members.find(
        (member) => String(member.user?._id || member.user) === String(req.userId)
      )?.user || invite.receiverId;
    const joiningName =
      [joiningUser?.firstName, joiningUser?.lastName].filter(Boolean).join(" ") ||
      joiningUser?.email ||
      "A member";

    await emitGroupSystemMessage({
      group,
      senderId: req.userId,
      content: `${joiningName} joined the group`,
      meta: {
        action: "member_joined",
        memberId: String(req.userId),
      },
    });

    await updateNotificationMetaByReference({
      userId: req.userId,
      type: "group_invite",
      referenceId: String(invite._id),
      metaPatch: {
        requestStatus: "accepted",
        handledAt: new Date().toISOString(),
      },
    });

    const io = getIO();
    io?.to(getUserRoom(String(req.userId))).emit("group_invite_accepted", {
      invite,
      group: formatGroup(group, req.userId),
    });
    io?.to(getUserRoom(String(req.userId))).emit("notification_update");
    await emitGroupUpdated(group, req.userId);

    return res.status(200).json({
      message: "Group invite accepted.",
      invite,
      group: formatGroup(group, req.userId),
    });
  } catch (error) {
    console.error("Error accepting group invite:", error);
    return res.status(400).json({ message: error.message || "Failed to accept group invite." });
  }
};

export const rejectInvite = async (req, res) => {
  try {
    const invite = await rejectGroupInvite({
      inviteId: req.params.inviteId,
      userId: req.userId,
    });

    await updateNotificationMetaByReference({
      userId: req.userId,
      type: "group_invite",
      referenceId: String(invite._id),
      metaPatch: {
        requestStatus: "rejected",
        handledAt: new Date().toISOString(),
      },
    });

    const io = getIO();
    io?.to(getUserRoom(String(req.userId))).emit("notification_update");

    return res.status(200).json({
      message: "Group invite rejected.",
      invite,
    });
  } catch (error) {
    console.error("Error rejecting group invite:", error);
    return res.status(400).json({ message: error.message || "Failed to reject group invite." });
  }
};
