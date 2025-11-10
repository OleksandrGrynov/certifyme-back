
import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
    createCheckoutSession,
    confirmLocalPayment,
} from "../controllers/paymentController.js";

const router = express.Router();


router.post("/checkout", authMiddleware, createCheckoutSession);



router.post("/confirm-local", authMiddleware, confirmLocalPayment);




export default router;
