import express from "express";
const router = express.Router();

// тимчасовий тестовий маршрут
router.get("/", (req, res) => {
    res.send("✅ Review API працює");
});

export default router;
