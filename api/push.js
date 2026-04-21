// api/push.js — minimal probe to isolate the 500
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://tripva.app');
  return res.status(200).json({ ok: true, url: req.url, method: req.method });
}
