import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";




export default async function authMiddleware(req, res, next) {
    try {
        
        if (req.method === "OPTIONS" || req.originalUrl === "/favicon.ico") {
            return next();
        }

        
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (!authHeader) {
            console.log("🚫 No Authorization header:", req.originalUrl);
            return res.status(401).json({ success: false, message: "No token provided" });
        }

        
        if (!authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ success: false, message: "Invalid token format" });
        }

        const token = authHeader.split(" ")[1];
        if (!token) {
            return res.status(401).json({ success: false, message: "Token missing" });
        }

        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: {
                id: true,
                email: true,
                role: true,
                firstName: true,
                lastName: true,
            },
        });

        if (!user) {
            return res.status(401).json({ success: false, message: "User not found" });
        }

        
        req.user = {
            id: user.id,
            email: user.email,
            role: user.role,
            first_name: user.firstName,
            last_name: user.lastName,
        };

        next();
    } catch (err) {
        console.error(" authMiddleware error:", err.message);
        return res.status(403).json({ success: false, message: "Invalid or expired token" });
    }
}




export function isAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    if (req.user.role !== "admin") {
        return res.status(403).json({ success: false, message: "Access denied: admin only" });
    }
    next();
}




export const verifyToken = (req, res, next) => {
    const header = req.headers.authorization;
    if (!header) {
        return res.status(403).json({ success: false, message: "No token" });
    }

    const token = header.split(" ")[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        return res.status(403).json({ success: false, message: "Invalid token" });
    }
};
