/**
 * Local Express development server.
 * In production, Vercel serves api/plan.js, api/patch.js, api/health.js directly.
 *
 * Usage: node api/server.js  (or: npm start)
 */
import express from 'express';
import planHandler from './plan.js';
import patchHandler from './patch.js';
import healthHandler from './health.js';

const app = express();

// Parse JSON bodies (Vercel does this automatically; Express needs it explicit)
app.use(express.json({ limit: '2mb' }));

// Mount handlers — Express req/res is fully compatible with the Vercel handler signature
app.all('/api/plan', planHandler);
app.all('/api/patch', patchHandler);
app.all('/api/health', healthHandler);

// 404 for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`TripAI backend running at http://localhost:${PORT}`);
  console.log(`  GET  http://localhost:${PORT}/api/health`);
  console.log(`  POST http://localhost:${PORT}/api/plan`);
  console.log(`  POST http://localhost:${PORT}/api/patch`);
  console.log();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠  ANTHROPIC_API_KEY is not set — requests will fail');
  }
});
