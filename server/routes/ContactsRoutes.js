import { Router } from "express";
import {
  addFriend,
  getLastMessageForUsers,
  searchContacts,
} from "../controllers/ContactsController.js";
import { verifyToken } from "../middlewares/AuthMiddleware.js";
import { getUserDetails } from "../controllers/ContactsController.js";

const contactsRoutes = Router();

// Search for contacts (authenticated)
contactsRoutes.post("/search", verifyToken, searchContacts);

// Add a new friend (authenticated)
contactsRoutes.post("/addUser", verifyToken, addFriend);

contactsRoutes.post("/details", verifyToken, getUserDetails);
contactsRoutes.post("/lastMessage", verifyToken, getLastMessageForUsers);
export default contactsRoutes;
