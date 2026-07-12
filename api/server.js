// Local dev server moved to /dev-server.js — this stub prevents Vercel from
// deploying the old Express app.listen() as a hanging serverless function.
export default function handler(req, res) {
  res.status(404).json({ error: 'Not found' });
}
