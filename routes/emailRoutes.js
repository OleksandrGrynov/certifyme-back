import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { sendEmailCode, verifyEmailCode } from "../controllers/emailController.js";

const router = express.Router();

router.post("/email/send-code", authMiddleware, sendEmailCode);
router.post("/email/verify-code", authMiddleware, verifyEmailCode);

export default router;
