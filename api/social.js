// api/social.js — admin-only social media publishing + scheduling (FB page + IG).
// Auth: same admin-email pattern as api/admin.js.
// Cron: /api/social/cron (Vercel Cron, every 15 min) publishes due scheduled posts.

import { createClient } from '@supabase/supabase-js';
import {
  getAccountStatus,
  publishToFacebook,
  publishToInstagram,
  getRecentPosts,
} from '../lib/meta.js';

const SUPABASE_URL  = process.env.SUPABASE_URL;
const ANON_KEY      = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_EMAILS  = (process.env.ADMIN_EMAILS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const CRON_SECRET   = process.env.CRON_SECRET || '';

const serviceClient = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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

  const url = req.url || '';

  // GET /api/social/cron — Vercel Cron handler, publishes due posts
  // Must be before admin auth since cron uses CRON_SECRET, not JWT.
  if (req.method === 'GET' && url.includes('/cron')) {
    const authHeader = req.headers.authorization;
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return res.status(401).json({ error: 'Invalid cron secret' });
    }

    try {
      const sb = serviceClient();
      const now = new Date().toISOString();
      const { data: due, error: fetchErr } = await sb.from('scheduled_posts')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduled_at', now)
        .order('scheduled_at', { ascending: true })
        .limit(10);

      if (fetchErr) throw new Error(fetchErr.message);
      if (!due?.length) return res.status(200).json({ ok: true, published: 0 });

      const results = [];
      for (const post of due) {
        try {
          const pubResult = {};
          if (post.platforms.includes('facebook')) {
            pubResult.facebook = await publishToFacebook({
              message: post.message || post.caption,
              imageUrl: post.image_url,
              link: post.link,
            });
          }
          if (post.platforms.includes('instagram') && post.image_url) {
            pubResult.instagram = await publishToInstagram({
              imageUrl: post.image_url,
              caption: post.caption || post.message,
            });
          }
          await sb.from('scheduled_posts').update({
            status: 'published',
            published_at: new Date().toISOString(),
            result: pubResult,
          }).eq('id', post.id);
          results.push({ id: post.id, status: 'published' });
        } catch (pubErr) {
          await sb.from('scheduled_posts').update({
            status: 'failed',
            error: pubErr.message,
          }).eq('id', post.id);
          results.push({ id: post.id, status: 'failed', error: pubErr.message });
        }
      }

      return res.status(200).json({ ok: true, published: results.filter(r => r.status === 'published').length, results });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Admin access required' });

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

  // POST /api/social/publish — immediate publish
  if (req.method === 'POST' && url.includes('/publish') && !url.includes('/schedule')) {
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

  // GET /api/social/schedule — list scheduled posts
  if (req.method === 'GET' && url.includes('/schedule')) {
    try {
      const params = new URL(url, 'https://x').searchParams;
      const status = params.get('status') || 'pending';
      const sb = serviceClient();
      let query = sb.from('scheduled_posts').select('*').order('scheduled_at', { ascending: true });
      if (status !== 'all') query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, posts: data || [] });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST /api/social/schedule — create scheduled post(s)
  if (req.method === 'POST' && url.includes('/schedule')) {
    try {
      const body = req.body || {};
      const posts = Array.isArray(body) ? body : [body];
      const rows = [];

      for (const p of posts) {
        const { platforms, message, caption, imageUrl, link, scheduledAt } = p;
        if (!platforms || !Array.isArray(platforms) || !platforms.length) {
          return res.status(400).json({ error: 'platforms[] required' });
        }
        if (!scheduledAt) {
          return res.status(400).json({ error: 'scheduledAt (ISO 8601) required' });
        }
        if (platforms.includes('instagram') && !imageUrl) {
          return res.status(400).json({ error: 'imageUrl required for Instagram' });
        }
        rows.push({
          platforms,
          message: message || null,
          caption: caption || null,
          image_url: imageUrl || null,
          link: link || null,
          scheduled_at: scheduledAt,
          status: 'pending',
          created_by: admin.email,
        });
      }

      const sb = serviceClient();
      const { data, error } = await sb.from('scheduled_posts').insert(rows).select();
      if (error) throw new Error(error.message);
      return res.status(201).json({ ok: true, scheduled: data });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE /api/social/schedule?id=xxx — cancel a scheduled post
  if (req.method === 'DELETE' && url.includes('/schedule')) {
    try {
      const params = new URL(url, 'https://x').searchParams;
      const id = params.get('id');
      if (!id) return res.status(400).json({ error: 'id required' });
      const sb = serviceClient();
      const { data, error } = await sb.from('scheduled_posts')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .eq('status', 'pending')
        .select();
      if (error) throw new Error(error.message);
      if (!data?.length) return res.status(404).json({ error: 'Post not found or already published' });
      return res.status(200).json({ ok: true, cancelled: data[0] });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(404).json({ error: 'Not found' });
}
