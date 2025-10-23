import express from "express";
import {
    registerUser,
    loginUser,
    getCurrentUser,
    updateProfile,
    changePassword
} from "../controllers/userController.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/me", getCurrentUser);
router.put("/update", updateProfile);
router.put("/password", changePassword);

export default router;
