// scripts/smoke-analytics.js
import axios from 'axios';
const BASE = `${process.env.BACKEND_URL}/api`;
const email = process.env.SMOKE_EMAIL || 'admin@example.com';
const password = process.env.SMOKE_PASSWORD || 'Admin123!';

async function main() {
  const loginRes = await axios.post(`${BASE}/users/login`, { email, password });
  const token = loginRes.data.token;
  if (!token) throw new Error('No token from login');
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const ach = await axios.get(`${BASE}/achievements`, auth);
  console.log('Achievements count:', ach.data?.achievements?.length);

  const ov = await axios.get(`${BASE}/analytics/user/overview`, auth);
  console.log('Overview:', ov.data?.data);

  const daily = await axios.get(`${BASE}/analytics/user/daily?days=7`, auth);
  console.log('Daily points:', daily.data?.data?.activity?.length);

  const top = await axios.get(`${BASE}/analytics/user/top-courses?limit=5`, auth);
  console.log('Top courses:', top.data?.data?.length);

  const recent = await axios.get(`${BASE}/analytics/user/recent?limit=5`, auth);
  console.log('Recent events:', recent.data?.data?.length);
}

main().catch((e) => {
  if (e.response) {
    console.error('Smoke failed:', e.response.status, e.response.data);
  } else {
    console.error('Smoke failed:', e.message);
  }
  process.exit(1);
});
