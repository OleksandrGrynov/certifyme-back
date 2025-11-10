import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import prisma from "./prisma.js"; 
import dotenv from "dotenv";

dotenv.config();

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: `${process.env.BACKEND_URL}/api/auth/google/callback`,
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const email = profile.emails?.[0]?.value;
                const first_name = profile.name?.givenName || "";
                const last_name = profile.name?.familyName || "";

                if (!email) {
                    return done(new Error("No email from Google profile"), null);
                }

                
                let user = await prisma.user.findUnique({
                    where: { email },
                });

                if (!user) {
                    
                    user = await prisma.user.create({
                        data: {
                            first_name,
                            last_name,
                            email,
                            password: "", 
                            role: "user",
                            created_at: new Date(),
                        },
                        select: {
                            id: true,
                            first_name: true,
                            last_name: true,
                            email: true,
                            role: true,
                            created_at: true,
                        },
                    });
                }

                return done(null, user);
            } catch (err) {
                console.error(" GoogleStrategy error:", err);
                done(err, null);
            }
        }
    )
);

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: Number(id) },
        });
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

export default passport;
