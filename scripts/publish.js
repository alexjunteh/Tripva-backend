#!/usr/bin/env node
// Local CLI for publishing to Tripva FB page + IG via Meta Graph API.
// Usage:
//   node scripts/publish.js status
//   node scripts/publish.js post --fb --ig --message "..." --image "https://..." --caption "IG caption"
//   node scripts/publish.js batch schedule.json
//   node scripts/publish.js recent [facebook|instagram] [limit]

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Minimal .env loader
function loadEnv() {
  try {
    const raw = readFileSync(resolve(ROOT, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env is optional — vars can come from shell environment
  }
}

loadEnv();

const {
  publishToFacebook,
  publishToInstagram,
  getAccountStatus,
  getRecentPosts,
} = await import('../lib/meta.js');

const args = process.argv.slice(2);
const cmd = args[0];

function flag(name) {
  return args.includes(`--${name}`);
}

function opt(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

async function status() {
  const s = await getAccountStatus();
  console.log('\n📊 Account Status');
  console.log(`  FB: ${s.facebook.name} — ${s.facebook.fan_count} fans (${s.facebook.category})`);
  console.log(`  IG: @${s.instagram.username} — ${s.instagram.followers_count} followers, ${s.instagram.media_count} posts\n`);
}

async function post() {
  const fb = flag('fb') || flag('facebook');
  const ig = flag('ig') || flag('instagram');
  const both = flag('both') || (!fb && !ig);
  const message = opt('message') || opt('m');
  const caption = opt('caption') || opt('c') || message;
  const imageUrl = opt('image') || opt('i');
  const link = opt('link') || opt('l');

  if (!message && !caption) {
    console.error('Error: --message "text" required');
    process.exit(1);
  }

  const results = {};

  if (fb || both) {
    console.log('Publishing to Facebook...');
    results.facebook = await publishToFacebook({ message: message || caption, imageUrl, link });
    console.log(`  ✓ FB post ID: ${results.facebook.id || results.facebook.post_id}`);
  }

  if (ig || both) {
    if (!imageUrl) {
      console.error('Error: --image URL required for Instagram');
      process.exit(1);
    }
    console.log('Publishing to Instagram...');
    results.instagram = await publishToInstagram({ imageUrl, caption: caption || message });
    console.log(`  ✓ IG media ID: ${results.instagram.id}`);
  }

  console.log('\nDone.', JSON.stringify(results, null, 2));
}

async function batch() {
  const file = args[1] || 'scripts/schedule.json';
  const filePath = resolve(ROOT, file);
  let posts;
  try {
    posts = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`Cannot read ${filePath}: ${e.message}`);
    process.exit(1);
  }

  if (!Array.isArray(posts)) posts = [posts];

  console.log(`\nPublishing ${posts.length} post(s)...\n`);

  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const label = p.label || `Post ${i + 1}`;
    console.log(`[${i + 1}/${posts.length}] ${label}`);

    try {
      const platforms = p.platforms || ['facebook', 'instagram'];

      if (platforms.includes('facebook')) {
        const fb = await publishToFacebook({
          message: p.message || p.caption,
          imageUrl: p.imageUrl,
          link: p.link,
        });
        console.log(`  ✓ FB: ${fb.id || fb.post_id}`);
      }

      if (platforms.includes('instagram')) {
        if (!p.imageUrl) {
          console.log('  ⚠ Skipping IG — no imageUrl');
        } else {
          const ig = await publishToInstagram({
            imageUrl: p.imageUrl,
            caption: p.caption || p.message,
          });
          console.log(`  ✓ IG: ${ig.id}`);
        }
      }
    } catch (e) {
      console.error(`  ✗ Failed: ${e.message}`);
    }

    // Rate-limit pause between posts
    if (i < posts.length - 1) {
      console.log('  (waiting 10s before next post...)');
      await new Promise(r => setTimeout(r, 10000));
    }
  }

  console.log('\nBatch complete.');
}

async function recent() {
  const platform = args[1] || 'facebook';
  const limit = parseInt(args[2] || '5', 10);
  const data = await getRecentPosts(platform, limit);
  const posts = data.data || [];

  console.log(`\n📋 Recent ${platform} posts (${posts.length}):\n`);
  for (const p of posts) {
    if (platform === 'instagram') {
      console.log(`  ${p.timestamp} — ${(p.caption || '').slice(0, 80)}...`);
      console.log(`    ❤️ ${p.like_count || 0}  💬 ${p.comments_count || 0}`);
    } else {
      console.log(`  ${p.created_time} — ${(p.message || '').slice(0, 80)}...`);
      console.log(`    🔗 ${p.permalink_url || ''}`);
    }
  }
  console.log();
}

try {
  switch (cmd) {
    case 'status': await status(); break;
    case 'post': await post(); break;
    case 'batch': await batch(); break;
    case 'recent': await recent(); break;
    default:
      console.log(`
Tripva Social Publisher — Local CLI

Commands:
  status                          Check FB page + IG account info
  post --fb --ig --message "..."  Publish to FB and/or IG
       --image URL --caption "..."  (--both or omit flags = both platforms)
       --link URL
  batch [file.json]               Publish multiple posts from JSON file
  recent [facebook|instagram] [n] Show recent posts

Examples:
  node scripts/publish.js status
  node scripts/publish.js post --both --message "Hello world!" --image "https://..."
  node scripts/publish.js batch scripts/schedule.json
  node scripts/publish.js recent instagram 10

Env vars needed (set in .env or shell):
  META_ACCESS_TOKEN, META_PAGE_ID, META_IG_ACCOUNT_ID
`);
  }
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
