import { Router } from "express";
import {
  addFriend,
  getLastMessageForUsers,
  listContacts,
  searchContacts,
} from "../controllers/ContactsController.js";
import { verifyToken } from "../middlewares/AuthMiddleware.js";
import { getUserDetails } from "../controllers/ContactsController.js";
import {
  antiReplay,
  userWriteRateLimiter,
} from "../middlewares/SecurityMiddleware.js";
import {
  validateContactId,
  validateContactSearch,
  validateUserIdList,
} from "../middlewares/ValidationMiddleware.js";

const contactsRoutes = Router();

contactsRoutes.post("/search", verifyToken, validateContactSearch, searchContacts);

contactsRoutes.post(
  "/addUser",
  verifyToken,
  validateContactId,
  antiReplay,
  userWriteRateLimiter,
  addFriend
);

contactsRoutes.post("/details", verifyToken, validateUserIdList, getUserDetails);
contactsRoutes.post("/lastMessage", verifyToken, validateUserIdList, getLastMessageForUsers);
contactsRoutes.get("/list", verifyToken, listContacts);
export default contactsRoutes;
