/**
 * Shared GitHub save logic — used by both POST /api/save and the
 * atomic stream→save path in POST /api/plan.
 */
import { randomUUID } from 'crypto';

const REPO = process.env.GITHUB_REPO || 'FuturiztaOS/trip-planner';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const PLAN_PATH_PREFIX = (process.env.GITHUB_PLAN_PATH_PREFIX || 'plans').replace(/^\/+|\/+$/g, '');
const SHARE_BASE = process.env.GITHUB_SHARE_BASE || 'https://futuriztaos.github.io/trip-planner/trip.html';

/**
 * Save a plan object to GitHub as a JSON file.
 *
 * @param {object} plan - The tripState to persist
 * @returns {Promise<{ id: string, url: string }>}
 * @throws {Error} If GITHUB_TOKEN is missing or GitHub API fails
 */
export async function savePlanToGitHub(plan) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not configured');

  const id = randomUUID().replace(/-/g, '').slice(0, 16);
  const path = `${PLAN_PATH_PREFIX}/${id}.json`;
  const content = Buffer.from(JSON.stringify(plan)).toString('base64');

  const ghRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization':        `Bearer ${token}`,
      'Content-Type':         'application/json',
      'Accept':               'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent':           'Tripva-TripPlanner/1.0',
    },
    body: JSON.stringify({
      message: `Add trip plan ${id}`,
      content,
      branch: BRANCH,
    }),
  });

  if (!ghRes.ok) {
    const errText = await ghRes.text();
    throw new Error(`GitHub API ${ghRes.status}: ${errText}`);
  }

  return { id, url: `${SHARE_BASE}?id=${id}` };
}
