// api/og.js — Dynamic per-trip Open Graph image generator.
//
// GET /api/og?id=<gist_id>  →  1200x630 PNG showing the trip's destination,
// dates, and hero photo. Social crawlers fetch this when Cloudflare rewrites
// the og:image meta tag on /trip?id=X (see cloudflare/og-worker.js).
//
// Runs on Edge runtime — @vercel/og requires it and the image is pure render
// work (no DB calls, just a Gist fetch). Low latency globally.

import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USER  = 'alexjunteh';

// Fallback hero image (shown when we can't derive one from the trip)
const FALLBACK_HERO = 'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1200&h=630&fit=crop&q=75';

async function fetchTrip(id) {
  if (!id) return null;
  try {
    const r = await fetch(`https://api.github.com/gists/${id}`, {
      headers: {
        'Authorization': GITHUB_TOKEN ? `token ${GITHUB_TOKEN}` : '',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'tripva-og'
      },
      // Cache aggressively at the edge — trip data changes rarely
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!r.ok) return null;
    const gist = await r.json();
    // Find a file that parses as a Tripva plan
    const files = gist.files || {};
    for (const name of Object.keys(files)) {
      try {
        const content = files[name].content;
        if (!content) continue;
        const parsed = JSON.parse(content);
        const plan = parsed.rawPlan || parsed;
        if (plan && plan.trip) return plan;
      } catch (_) {}
    }
    return null;
  } catch (_) { return null; }
}

function pickHero(plan) {
  const days = plan.days || [];
  for (const d of days) {
    const img = d.heroImg || d.imageUrl || (d.photos && d.photos[0]);
    if (img && typeof img === 'string' && img.startsWith('http')) return img;
  }
  return plan.trip?.heroImg || FALLBACK_HERO;
}

function fmtDate(ymd) {
  if (!ymd) return '';
  const m = String(ymd).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return ymd;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[+m[2]-1]} ${+m[3]}`;
}

export default async function handler(req) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') || '';

  const plan = await fetchTrip(id);
  const trip = (plan && plan.trip) || {};

  const destination = trip.destination || trip.name || 'Your next adventure';
  const name = trip.name || destination;
  const dateStr = (trip.startDate && trip.endDate)
    ? `${fmtDate(trip.startDate)} → ${fmtDate(trip.endDate)}`
    : (trip.dates || '');
  const dayCount = (plan && plan.days && plan.days.length) || 0;
  const travelers = trip.travelers || trip.people || 0;
  const archetype = trip.archetype ? trip.archetype[0].toUpperCase() + trip.archetype.slice(1) : '';

  const metaLine = [
    dayCount ? `${dayCount}-day trip` : '',
    travelers ? `for ${travelers}` : '',
    archetype ? `· ${archetype}` : ''
  ].filter(Boolean).join(' ');

  const hero = pickHero(plan || {});

  return new ImageResponse(
    (
      {
        type: 'div',
        props: {
          style: {
            width: '1200px',
            height: '630px',
            display: 'flex',
            position: 'relative',
            backgroundColor: '#0a0a12',
            fontFamily: 'sans-serif',
          },
          children: [
            // Hero background
            {
              type: 'img',
              props: {
                src: hero,
                width: 1200,
                height: 630,
                style: {
                  position: 'absolute',
                  top: 0, left: 0,
                  width: '1200px',
                  height: '630px',
                  objectFit: 'cover',
                  filter: 'brightness(.55)',
                }
              }
            },
            // Darkening gradient overlay
            {
              type: 'div',
              props: {
                style: {
                  position: 'absolute',
                  top: 0, left: 0,
                  width: '1200px', height: '630px',
                  display: 'flex',
                  background: 'linear-gradient(135deg, rgba(10,10,18,.4) 0%, rgba(10,10,18,.85) 100%)',
                }
              }
            },
            // Content block
            {
              type: 'div',
              props: {
                style: {
                  position: 'relative',
                  width: '1200px',
                  height: '630px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  padding: '64px',
                  color: '#f5f0e8',
                },
                children: [
                  // Kicker row — Tripva brand + optional "SHARED TRIP"
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        fontSize: 22,
                        fontWeight: 700,
                        letterSpacing: '2px',
                        textTransform: 'uppercase',
                        color: 'rgba(245,240,232,.75)',
                        marginBottom: '12px',
                      },
                      children: [
                        { type: 'span', props: { style: { color: '#95b8ff' }, children: '✦ Tripva' } },
                        id ? { type: 'span', props: { style: { color: 'rgba(245,240,232,.55)' }, children: '· Shared trip' } } : null,
                      ].filter(Boolean)
                    }
                  },
                  // Destination — huge editorial title
                  {
                    type: 'div',
                    props: {
                      style: {
                        fontSize: destination.length > 28 ? 70 : 88,
                        fontWeight: 700,
                        letterSpacing: '-.02em',
                        lineHeight: 1.02,
                        marginBottom: '18px',
                        maxWidth: '1080px',
                        display: 'flex',
                      },
                      children: destination,
                    }
                  },
                  // Meta line — days/travelers/archetype
                  metaLine ? {
                    type: 'div',
                    props: {
                      style: {
                        fontSize: 30,
                        fontWeight: 500,
                        color: 'rgba(245,240,232,.9)',
                        marginBottom: dateStr ? '12px' : 0,
                        display: 'flex',
                      },
                      children: metaLine,
                    }
                  } : null,
                  // Date range
                  dateStr ? {
                    type: 'div',
                    props: {
                      style: {
                        fontSize: 26,
                        fontWeight: 500,
                        color: 'rgba(149,184,255,.9)',
                        display: 'flex',
                      },
                      children: dateStr,
                    }
                  } : null,
                ].filter(Boolean)
              }
            },
            // Top-right pill
            {
              type: 'div',
              props: {
                style: {
                  position: 'absolute',
                  top: '40px',
                  right: '48px',
                  padding: '10px 20px',
                  backgroundColor: 'rgba(124,106,247,.25)',
                  border: '1px solid rgba(124,106,247,.6)',
                  borderRadius: '999px',
                  fontSize: 20,
                  fontWeight: 700,
                  color: '#c7b8ff',
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase',
                  display: 'flex',
                },
                children: 'Plan your own →',
              }
            },
          ]
        }
      }
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        // Cache at edge for 1h, browsers for 5min. Trip data changes rarely.
        'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      }
    }
  );
}
