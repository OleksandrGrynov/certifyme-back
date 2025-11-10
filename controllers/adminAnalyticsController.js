import prisma from "../config/prisma.js";
import * as service from "../services/analyticsService.js"; 


async function audit(req, startMs) {
  try {
    const duration = Date.now() - startMs;

    await prisma.admin_audit.create({
      data: {
        admin_id: req.user?.id || null,
        endpoint: req.originalUrl,
        method: req.method,
        params: JSON.stringify(req.query || {}),
        ip: req.ip,
        user_agent: req.get("User-Agent") || "",
        duration_ms: duration,
      },
    });
  } catch (e) {
    console.error("audit log error:", e.message);
  }
}


export async function getOverview(req, res) {
  const start = Date.now();
  try {
    const data = await service.getOverview(); 
    await audit(req, start);
    res.json({ success: true, data });
  } catch (err) {
    console.error("getOverview error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}


export async function getDaily(req, res) {
  const start = Date.now();
  try {
    const days = Math.min(parseInt(req.query.days || "30", 10), 365);

    
    const data = await prisma.analytics_daily.findMany({
      orderBy: { date: "desc" },
      take: days,
    });

    await audit(req, start);
    res.json({ success: true, data });
  } catch (err) {
    console.error("getDaily error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}


export async function getTopCourses(req, res) {
  const start = Date.now();
  try {
    const limit = Math.min(parseInt(req.query.limit || "10", 10), 100);

    
    const data = await prisma.certificate.groupBy({
      by: ["course"],
      _count: { course: true },
      _avg: { percent: true },
      orderBy: { _count: { course: "desc" } },
      take: limit,
      where: { course: { not: null } },
    });

    await audit(req, start);
    res.json({ success: true, data });
  } catch (err) {
    console.error("getTopCourses error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}


export async function getRecent(req, res) {
  const start = Date.now();
  try {
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 500);
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const skip = (page - 1) * limit;

    const data = await prisma.user_activity.findMany({
      orderBy: { created_at: "desc" },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, email: true } },
      },
    });

    await audit(req, start);
    res.json({ success: true, data });
  } catch (err) {
    console.error("getRecent error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}


export async function getUserMetrics(req, res) {
  const start = Date.now();
  try {
    const from = req.query.from ? new Date(req.query.from) : undefined;
    const to = req.query.to ? new Date(req.query.to) : undefined;
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 500);
    const skip = (page - 1) * limit;

    const data = await prisma.user.findMany({
      skip,
      take: limit,
      where: {
        created_at: {
          gte: from,
          lte: to,
        },
      },
      include: {
        certificates: true,
        achievements: true,
      },
    });

    await audit(req, start);
    res.json({ success: true, data });
  } catch (err) {
    console.error("getUserMetrics error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}


export async function getTestResults(req, res) {
  const start = Date.now();
  try {
    const { id } = req.params;
    const from = req.query.from ? new Date(req.query.from) : undefined;
    const to = req.query.to ? new Date(req.query.to) : undefined;

    const data = await prisma.test_results.findMany({
      where: {
        test_id: parseInt(id, 10),
        created_at: {
          gte: from,
          lte: to,
        },
      },
      include: {
        user: { select: { id: true, email: true } },
      },
      orderBy: { created_at: "desc" },
    });

    await audit(req, start);
    res.json({ success: true, data });
  } catch (err) {
    console.error("getTestResults error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}
