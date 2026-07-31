// api/social.js — admin-only social media publishing (FB page + IG).
// Auth: same admin-email pattern as api/admin.js.

import { createClient } from '@supabase/supabase-js';
import {
  getAccountStatus,
  publishToFacebook,
  publishToInstagram,
  getRecentPosts,
} from '../lib/meta.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY     = process.env.SUPABASE_ANON_KEY;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const ALLOWED_ORIGINS = [
  'https://tripva.app',
  'https://www.tripva.app',
  'https://tripva-frontend.vercel.app',
  'https://tripva-frontend.pages.dev',
];

function setCors(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ALLOWED_ORIGINS.includes(origin)
    || /^https:\/\/tripva-frontend-[a-z0-9]+-alexs-projects\.vercel\.app$/.test(origin);
  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : 'https://tripva.app');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function requireAdmin(req) {
  const token = req.headers.authorization?.replace('Bearer ', '') || null;
  if (!token || !ADMIN_EMAILS.length) return null;

  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } = {}, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  if (!ADMIN_EMAILS.includes((user.email || '').toLowerCase())) return null;
  return user;
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Admin access required' });

  const url = req.url || '';

  // GET /api/social/status — account info
  if (req.method === 'GET' && url.includes('/status')) {
    try {
      const status = await getAccountStatus();
      return res.status(200).json({ ok: true, ...status });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // GET /api/social/posts?platform=facebook|instagram&limit=10
  if (req.method === 'GET' && url.includes('/posts')) {
    try {
      const params = new URL(url, 'https://x').searchParams;
      const platform = params.get('platform') || 'facebook';
      const limit = Math.min(parseInt(params.get('limit') || '10', 10), 50);
      const posts = await getRecentPosts(platform, limit);
      return res.status(200).json({ ok: true, platform, ...posts });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST /api/social/publish
  if (req.method === 'POST' && url.includes('/publish')) {
    try {
      const { platforms, message, caption, imageUrl, link } = req.body || {};

      if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
        return res.status(400).json({ error: 'platforms[] required (facebook, instagram)' });
      }

      const results = {};

      if (platforms.includes('facebook')) {
        results.facebook = await publishToFacebook({
          message: message || caption,
          imageUrl,
          link,
        });
      }

      if (platforms.includes('instagram')) {
        if (!imageUrl) {
          return res.status(400).json({ error: 'imageUrl required for Instagram' });
        }
        results.instagram = await publishToInstagram({
          imageUrl,
          caption: caption || message,
        });
      }

      return res.status(200).json({ ok: true, results });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(404).json({ error: 'Not found' });
}
