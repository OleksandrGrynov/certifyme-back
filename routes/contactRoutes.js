// routes/contactRoutes.js
import express from "express";
import { createContact, getContacts } from "../controllers/contactController.js";
import { pool } from "../config/db.js";

const router = express.Router();

router.post("/", createContact);
router.get("/", getContacts);

// 🗑️ Видалення заявки
router.delete("/:id", async (req, res) => {
    try {
        await pool.query("DELETE FROM contacts WHERE id = $1", [req.params.id]);
        res.json({ success: true, message: "Заявку видалено" });
    } catch (err) {
        console.error("❌ Помилка видалення заявки:", err);
        res.status(500).json({ success: false, message: "Помилка при видаленні заявки" });
    }
});
router.put("/:id/status", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        await pool.query("UPDATE contacts SET status = $1 WHERE id = $2", [status, id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
