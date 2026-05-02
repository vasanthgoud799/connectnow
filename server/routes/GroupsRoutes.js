import { Router } from "express";
import { verifyToken } from "../middlewares/AuthMiddleware.js";
import {
  acceptInvite,
  addMembers,
  createGroup,
  getGroupDetails,
  joinGroupByInvite,
  leaveGroup,
  listGroups,
  regenerateInvite,
  rejectInvite,
  removeMember,
  updateGroup,
} from "../controllers/GroupsController.js";

const groupsRoutes = Router();

groupsRoutes.get("/", verifyToken, listGroups);
groupsRoutes.get("/:groupId", verifyToken, getGroupDetails);
groupsRoutes.post("/", verifyToken, createGroup);
groupsRoutes.post("/join/:token", verifyToken, joinGroupByInvite);
groupsRoutes.post("/invites/:inviteId/accept", verifyToken, acceptInvite);
groupsRoutes.post("/invites/:inviteId/reject", verifyToken, rejectInvite);
groupsRoutes.patch("/:groupId", verifyToken, updateGroup);
groupsRoutes.patch("/:groupId/invite", verifyToken, regenerateInvite);
groupsRoutes.post("/:groupId/members", verifyToken, addMembers);
groupsRoutes.delete("/:groupId/members/:memberId", verifyToken, removeMember);
groupsRoutes.post("/:groupId/leave", verifyToken, leaveGroup);

export default groupsRoutes;
