import express from "express";
const router = express.Router();


router.get("/", (req, res) => {
    res.send(" Review API працює");
});

export default router;
