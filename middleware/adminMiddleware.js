export const isAdmin = (req, res, next) => {
    try {
        if (req.user?.role !== "admin") {
            return res.status(403).json({ success: false, message: "Access denied: admin only" });
        }
        next();
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};
