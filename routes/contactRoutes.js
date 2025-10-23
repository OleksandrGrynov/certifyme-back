import express from "express";
import { createContact, getContacts } from "../controllers/contactController.js";

const router = express.Router();

router.post("/", createContact);  // для фронту (форма)
router.get("/", getContacts);     // для менеджера (список)

export default router;
