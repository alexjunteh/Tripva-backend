import { applyCors } from '../lib/middleware.js';

export default function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.status(200).json({
    status: 'ok',
    service: 'tripai-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
}
