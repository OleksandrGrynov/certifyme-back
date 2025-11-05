import * as service from "../services/analyticsService.js";

// 🔹 Загальний огляд користувача
export async function getUserOverview(req, res) {
  try {
    const userId = req.user.id;
    const data = await service.getUserOverview(userId);
    return res.json({ success: true, data });
  } catch (err) {
    console.error("❌ getUserOverview error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// 🔹 Активність за останні дні
export async function getUserDaily(req, res) {
  try {
    const userId = req.user.id;
    const days = Math.min(parseInt(req.query.days || "30", 10), 365);
    const data = await service.getUserDaily(userId, days);
    return res.json({ success: true, data });
  } catch (err) {
    console.error("❌ getUserDaily error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// 🔹 Топ курсів користувача
export async function getUserTopCourses(req, res) {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit || "10", 10), 100);
    const data = await service.getUserTopCourses(userId, limit);
    return res.json({ success: true, data });
  } catch (err) {
    console.error("❌ getUserTopCourses error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// 🔹 Останні події
export async function getUserRecent(req, res) {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 500);
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const data = await service.getUserRecent(userId, limit, page);
    return res.json({ success: true, data });
  } catch (err) {
    console.error("❌ getUserRecent error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}
