// lib/meta.js — Meta Graph API helper for FB page + IG publishing.

const API_VERSION = 'v21.0';
const BASE = `https://graph.facebook.com/${API_VERSION}`;

function env(key) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

async function graphPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) {
    const e = new Error(data.error.message);
    e.code = data.error.code;
    e.type = data.error.type;
    throw e;
  }
  return data;
}

async function graphGet(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}${path}${qs ? '?' + qs : ''}`);
  const data = await res.json();
  if (data.error) {
    const e = new Error(data.error.message);
    e.code = data.error.code;
    e.type = data.error.type;
    throw e;
  }
  return data;
}

let _pageToken = null;

async function getPageToken() {
  if (_pageToken) return _pageToken;
  const token = env('META_ACCESS_TOKEN');
  const pageId = env('META_PAGE_ID');
  const data = await graphGet('/me/accounts', {
    fields: 'id,access_token',
    access_token: token,
  });
  const page = data.data?.find(p => p.id === pageId);
  if (!page) throw new Error(`Page ${pageId} not found in token's accounts`);
  _pageToken = page.access_token;
  return _pageToken;
}

export async function getAccountStatus() {
  const token = env('META_ACCESS_TOKEN');
  const pageId = env('META_PAGE_ID');
  const igId = env('META_IG_ACCOUNT_ID');

  const [page, ig] = await Promise.all([
    graphGet(`/${pageId}`, {
      fields: 'id,name,fan_count,category',
      access_token: token,
    }),
    graphGet(`/${igId}`, {
      fields: 'id,username,followers_count,media_count',
      access_token: token,
    }),
  ]);

  return { facebook: page, instagram: ig };
}

export async function publishToFacebook({ message, imageUrl, link }) {
  const pageToken = await getPageToken();
  const pageId = env('META_PAGE_ID');

  if (imageUrl) {
    return graphPost(`/${pageId}/photos`, {
      url: imageUrl,
      message,
      access_token: pageToken,
    });
  }

  const body = { message, access_token: pageToken };
  if (link) body.link = link;
  return graphPost(`/${pageId}/feed`, body);
}

export async function publishToInstagram({ imageUrl, caption, mediaType = 'IMAGE' }) {
  const token = env('META_ACCESS_TOKEN');
  const igId = env('META_IG_ACCOUNT_ID');

  if (!imageUrl) throw new Error('imageUrl is required for Instagram');

  const containerBody = {
    access_token: token,
    caption,
  };

  if (mediaType === 'VIDEO') {
    containerBody.video_url = imageUrl;
    containerBody.media_type = 'VIDEO';
  } else if (mediaType === 'CAROUSEL') {
    throw new Error('Carousel not yet supported — use single image or video');
  } else {
    containerBody.image_url = imageUrl;
  }

  const container = await graphPost(`/${igId}/media`, containerBody);

  if (mediaType === 'VIDEO') {
    let status = 'IN_PROGRESS';
    let attempts = 0;
    while (status === 'IN_PROGRESS' && attempts < 30) {
      await new Promise(r => setTimeout(r, 5000));
      const check = await graphGet(`/${container.id}`, {
        fields: 'status_code',
        access_token: token,
      });
      status = check.status_code;
      attempts++;
    }
    if (status !== 'FINISHED') {
      throw new Error(`Video processing failed: ${status}`);
    }
  }

  return graphPost(`/${igId}/media_publish`, {
    creation_id: container.id,
    access_token: token,
  });
}

export async function getRecentPosts(platform = 'facebook', limit = 10) {
  const token = env('META_ACCESS_TOKEN');

  if (platform === 'instagram') {
    const igId = env('META_IG_ACCOUNT_ID');
    return graphGet(`/${igId}/media`, {
      fields: 'id,caption,media_url,timestamp,like_count,comments_count',
      limit,
      access_token: token,
    });
  }

  const pageToken = await getPageToken();
  const pageId = env('META_PAGE_ID');
  return graphGet(`/${pageId}/feed`, {
    fields: 'id,message,created_time,full_picture,permalink_url',
    limit,
    access_token: pageToken,
  });
}
