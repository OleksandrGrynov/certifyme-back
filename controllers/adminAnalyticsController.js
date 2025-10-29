import * as service from '../services/analyticsService.js';
import { pool } from '../config/db.js';

async function audit(req, startMs) {
  try {
    const duration = Date.now() - startMs;
    await pool.query(
      `INSERT INTO admin_audit (admin_id, endpoint, method, params, ip, user_agent, duration_ms) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.user?.id || null, req.originalUrl, req.method, JSON.stringify(req.query || {}), req.ip, req.get('User-Agent') || '', duration]
    );
  } catch (e) {
    console.error('audit log error', e.message);
  }
}

export async function getOverview(req, res) {
  const start = Date.now();
  try {
    const data = await service.getOverview();
    await audit(req, start);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('getOverview error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

export async function getDaily(req, res) {
  const start = Date.now();
  try {
    const days = Math.min(parseInt(req.query.days || '30', 10), 365);
    const data = await service.getDaily(days);
    await audit(req, start);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('getDaily error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

export async function getTopCourses(req, res) {
  const start = Date.now();
  try {
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 100);
    const data = await service.getTopCourses(limit);
    await audit(req, start);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('getTopCourses error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

export async function getRecent(req, res) {
  const start = Date.now();
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 500);
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const data = await service.getRecent(limit, page);
    await audit(req, start);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('getRecent error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

export async function getUserMetrics(req, res) {
  const start = Date.now();
  try {
    const from = req.query.from || null;
    const to = req.query.to || null;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 500);
    const data = await service.getUserMetrics({ from, to, page, limit });
    await audit(req, start);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('getUserMetrics error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

export async function getTestResults(req, res) {
  const start = Date.now();
  try {
    const { id } = req.params;
    const from = req.query.from || null;
    const to = req.query.to || null;
    const data = await service.getTestResults(id, { from, to });
    await audit(req, start);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('getTestResults error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

