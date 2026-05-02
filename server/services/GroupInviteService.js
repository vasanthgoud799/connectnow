import Group from "../models/GroupModel.js";
import GroupInvite from "../models/GroupInviteModel.js";
import Chat from "../models/ChatModel.js";
import { getGroupConversationKey } from "./MessageService.js";

const normalizeId = (value) => String(value?._id || value);

const ensureAdminAccess = (group, userId) => {
  const member = group.members.find(
    (entry) => normalizeId(entry.user) === String(userId)
  );

  if (!member || !["owner", "admin"].includes(member.role)) {
    throw new Error("Only admins can invite members.");
  }
};

export const createGroupInvites = async ({ groupId, senderId, receiverIds = [] }) => {
  const group = await Group.findById(groupId).populate(
    "members.user",
    "firstName lastName email image status"
  );

  if (!group) {
    throw new Error("Group not found.");
  }

  ensureAdminAccess(group, senderId);

  const existingMemberIds = new Set(group.members.map((member) => normalizeId(member.user)));
  const dedupedReceiverIds = [...new Set(receiverIds.map(String))].filter(
    (receiverId) =>
      receiverId !== String(senderId) && !existingMemberIds.has(String(receiverId))
  );

  if (!dedupedReceiverIds.length) {
    return { group, invites: [] };
  }

  const existingPendingInvites = await GroupInvite.find({
    groupId,
    receiverId: { $in: dedupedReceiverIds },
    status: "pending",
  }).select("receiverId");

  const pendingReceiverIds = new Set(
    existingPendingInvites.map((invite) => normalizeId(invite.receiverId))
  );

  const invitesToCreate = dedupedReceiverIds.filter(
    (receiverId) => !pendingReceiverIds.has(String(receiverId))
  );

  if (!invitesToCreate.length) {
    return { group, invites: [] };
  }

  const invites = await GroupInvite.insertMany(
    invitesToCreate.map((receiverId) => ({
      groupId,
      senderId,
      receiverId,
      status: "pending",
    }))
  );

  return { group, invites };
};

export const acceptGroupInvite = async ({ inviteId, userId }) => {
  const invite = await GroupInvite.findById(inviteId)
    .populate("groupId")
    .populate("senderId", "firstName lastName email image")
    .populate("receiverId", "firstName lastName email image");

  if (!invite || invite.status !== "pending") {
    throw new Error("Group invite not found.");
  }

  if (normalizeId(invite.receiverId) !== String(userId)) {
    throw new Error("You do not have access to this invite.");
  }

  const group = await Group.findById(invite.groupId?._id || invite.groupId).populate(
    "members.user",
    "firstName lastName email image status"
  );

  if (!group) {
    throw new Error("Group not found.");
  }

  const alreadyMember = group.members.some(
    (member) => normalizeId(member.user) === String(userId)
  );

  if (!alreadyMember) {
    group.members.push({
      user: userId,
      role: "member",
    });
    await group.save();
    await group.populate("members.user", "firstName lastName email image status");
  }

  invite.status = "accepted";
  invite.respondedAt = new Date();
  await invite.save();

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

  return { invite, group };
};

export const rejectGroupInvite = async ({ inviteId, userId }) => {
  const invite = await GroupInvite.findById(inviteId)
    .populate("senderId", "firstName lastName email image")
    .populate("receiverId", "firstName lastName email image")
    .populate("groupId", "name description image inviteToken");

  if (!invite || invite.status !== "pending") {
    throw new Error("Group invite not found.");
  }

  if (normalizeId(invite.receiverId) !== String(userId)) {
    throw new Error("You do not have access to this invite.");
  }

  invite.status = "rejected";
  invite.respondedAt = new Date();
  await invite.save();

  return invite;
};
