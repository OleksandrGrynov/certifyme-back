import express from "express";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import prisma from "../config/prisma.js";

const router = express.Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);


router.post("/google-token", async (req, res) => {
    try {
        const { token } = req.body;
        if (!token)
            return res
                .status(400)
                .json({ success: false, message: "Token відсутній" });

        
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const email = payload.email;
        const firstName = payload.given_name;
        const lastName = payload.family_name;

        if (!email)
            return res
                .status(400)
                .json({ success: false, message: "Не вдалося отримати email з Google" });

        
        let user = await prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                createdAt: true,
                isGoogleUser: true,
                password: true,
            },
        });

        
        if (!user) {
            user = await prisma.user.create({
                data: {
                    firstName,
                    lastName,
                    email,
                    password: "", 
                    role: "user",
                    isVerified: true,
                    isGoogleUser: true,
                },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    role: true,
                    createdAt: true,
                    isGoogleUser: true,
                    password: true,
                },
            });
        } else if (!user.isGoogleUser) {
            
            await prisma.user.update({
                where: { email },
                data: { isGoogleUser: true },
            });
            user.isGoogleUser = true;
        }

        
        const jwtToken = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        
        res.json({ success: true, token: jwtToken, user });
    } catch (err) {
        console.error(" Google auth error:", err.message);
        res
            .status(403)
            .json({ success: false, message: "Помилка авторизації через Google" });
    }
});

export default router;
