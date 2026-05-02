import { Router } from "express";
import { verifyToken } from "../middlewares/AuthMiddleware.js";
import { globalSearch } from "../controllers/SearchController.js";

const searchRoutes = Router();

searchRoutes.get("/", verifyToken, globalSearch);

export default searchRoutes;
