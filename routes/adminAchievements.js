import express from "express";
import {
    createAchievement,
    updateAchievement,
    deleteAchievement,
    getAllAchievements,
} from "../controllers/adminAchievementController.js";
import { isAdmin } from "../middleware/adminMiddleware.js";

const router = express.Router();



router.get("/", isAdmin, getAllAchievements);


router.post("/", isAdmin, createAchievement);


router.put("/:id", isAdmin, updateAchievement);


router.delete("/:id", isAdmin, deleteAchievement);




export default router;
